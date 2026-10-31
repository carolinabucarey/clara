import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/youcam/image/route";
import { imageType } from "../image-format";
import { fetchResultImage, signedResultUrl, verifyResultUrl } from "./result-image";

const remote = "https://results.s3.amazonaws.com/photo.png?token=example";
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
beforeEach(() => { vi.stubEnv("YOUCAM_API_KEY", "test-only-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("result image proxy", () => {
  it("signs the entire URL and rejects modified results/signatures", () => {
    const url = new URL(signedResultUrl(remote), "https://clara.test");
    const sig = url.searchParams.get("signature")!;
    expect(verifyResultUrl(remote, sig)).toBe(true);
    expect(verifyResultUrl(`${remote}changed`, sig)).toBe(false);
    expect(verifyResultUrl(remote, "short")).toBe(false);
    expect(verifyResultUrl(remote, "0".repeat(64))).toBe(false);
  });

  it.each(["https://attacker.test/x", "http://results.s3.amazonaws.com/x", "https://x.amazonaws.com.attacker.test/x", "https://user:pass@results.s3.amazonaws.com/x", "https://results.s3.amazonaws.com:444/x"])("rejects untrusted result URL %s", (url) => {
    expect(() => signedResultUrl(url)).toThrow("forbidden_host");
  });

  it("does not fetch an unsigned URL", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const res = await GET(new NextRequest(`https://clara.test/api/youcam/image?url=${encodeURIComponent(remote)}`));
    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves raster bytes with a verified MIME type, no-store and nosniff", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(png, { headers: { "Content-Type": "text/html" } }));
    vi.stubGlobal("fetch", fetch);
    const res = await GET(new NextRequest(new URL(signedResultUrl(remote), "https://clara.test")));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
  });

  it("rejects HTML/SVG even when the upstream claims it is an image", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<svg onload='alert(1)'/>", { headers: { "Content-Type": "image/png" } })));
    await expect(fetchResultImage(remote)).rejects.toMatchObject({ code: "invalid_image", status: 502 });
  });

  it("distinguishes expired images from upstream outages and handles network errors", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(fetchResultImage(remote)).rejects.toMatchObject({ status: 410 });
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(fetchResultImage(remote)).rejects.toMatchObject({ status: 502 });
    fetch.mockRejectedValueOnce(new Error("network"));
    const res = await GET(new NextRequest(new URL(signedResultUrl(remote), "https://clara.test")));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "image_unavailable" });
  });

  it("limits image downloads before buffering an oversized response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(png, { headers: { "Content-Length": String(21 * 1024 * 1024) } })));
    await expect(fetchResultImage(remote)).rejects.toMatchObject({ status: 413 });
  });

  it("recognizes full PNG, JPEG and WebP signatures", () => {
    expect(imageType(png)).toBe("image/png");
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(imageType(new TextEncoder().encode("RIFF1234WEBP"))).toBe("image/webp");
    expect(imageType(new TextEncoder().encode("RIFF-not-webp"))).toBeNull();
    expect(imageType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});
