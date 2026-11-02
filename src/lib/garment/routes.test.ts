import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/garment/link/route";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "23.45.67.89", family: 4 }] }));
afterEach(() => vi.unstubAllGlobals());

const image = (url = "https://shop.example/photo") => new NextRequest(`https://clara.test/api/garment/link?${new URLSearchParams({ image: url })}`);
const page = (body: string, headers?: HeadersInit) => new NextRequest("https://clara.test/api/garment/link", { method: "POST", body, headers });

describe("store image proxy boundaries", () => {
  it.each(["image/svg+xml", "image/png", "text/html"])("rejects executable content even when advertised as %s", async (type) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', { headers: { "Content-Type": type } })));
    const response = await GET(image());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "linkNoImage" });
  });

  it.each([
    ["image/png", new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    ["image/jpeg", new Uint8Array([255, 216, 255, 224])],
    ["image/webp", new TextEncoder().encode("RIFF0000WEBP")],
    ["image/gif", new TextEncoder().encode("GIF89a")],
    ["image/avif", new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypavif"), 0, 0, 0, 0, ...new TextEncoder().encode("mif1avif")])],
  ])("serves %s by its binary signature with restrictive headers", async (type, bytes) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } })));
    const response = await GET(image());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(type);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("rejects IPv4-mapped loopback URLs before making a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(image("http://[::ffff:127.0.0.1]/"));
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("checks redirect destinations before fetching them", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { Location: "http://[::ffff:169.254.169.254]/" } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await GET(image())).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds JSON input and rejects cross-site requests before fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(page("null"))).status).toBe(400);
    expect((await POST(page("{"))).status).toBe(400);
    expect((await POST(page(JSON.stringify({ url: "https://shop.example/", extra: "x".repeat(8192) })))).status).toBe(413);
    expect((await POST(page('{"url":"https://shop.example/"}', { Origin: "https://other.example" }))).status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("still discovers a product gallery from a valid store page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<meta property="og:image" content="/photo.jpg">', { headers: { "Content-Type": "text/html" } })));
    const response = await POST(page('{"url":"https://shop.example/product"}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: null, images: ["https://shop.example/photo.jpg"] });
  });
});
