import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, readBytes, readForm, readImageFile, readJson, requireSameOrigin } from "./http";

afterEach(() => vi.useRealTimers());

describe("API input boundaries", () => {
  it("rejects an oversized declared body before reading it", async () => {
    const res = new Response("x", { headers: { "Content-Length": "1000" } });
    await expect(readBytes(res, 10)).rejects.toMatchObject({ status: 413 });
    expect(res.bodyUsed).toBe(false);
  });

  it("also limits streamed bodies without Content-Length", async () => {
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(5)); c.enqueue(new Uint8Array(6)); c.close(); } });
    await expect(readBytes(new Response(body), 10)).rejects.toMatchObject({ status: 413 });
  });

  it("returns a client error for malformed JSON and multipart bodies", async () => {
    await expect(readJson(new Request("https://clara.test/api/verdict", { method: "POST", body: "{" }))).rejects.toMatchObject({ status: 400 });
    await expect(readForm(new Request("https://clara.test/api/garment", { method: "POST", body: "bad" }), 100)).rejects.toMatchObject({ status: 415 });
    await expect(readForm(new Request("https://clara.test/api/garment", { method: "POST", body: "bad", headers: { "Content-Type": "multipart/form-data; boundary=test" } }), 100)).rejects.toMatchObject({ status: 400 });
  });

  it("accepts JPEG uploads and rejects empty, spoofed and unsupported images", async () => {
    const form = new FormData();
    form.set("image", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }));
    const req = new Request("https://clara.test/api/garment", { method: "POST", body: form });
    const parsed = await readForm(req, 1000);
    expect((await readImageFile(parsed, "image", 100))?.type).toBe("image/jpeg");
    await expect(readImageFile(parsed, "image", 2)).rejects.toMatchObject({ status: 413 });
    form.set("image", new Blob([], { type: "image/jpeg" }));
    await expect(readImageFile(form, "image", 100)).rejects.toMatchObject({ status: 400 });
    form.set("image", new Blob(["<svg onload='alert(1)'/>"], { type: "image/jpeg" }));
    await expect(readImageFile(form, "image", 100)).rejects.toMatchObject({ status: 415 });
    expect(await readImageFile(new FormData(), "image", 100)).toBeNull();
  });

  it("blocks cross-site browser submissions and allows same-origin/API clients", () => {
    expect(() => requireSameOrigin(new Request("https://clara.test/api/garment", { headers: { Origin: "https://attacker.test" } }))).toThrow("forbidden_origin");
    expect(() => requireSameOrigin(new Request("https://clara.test/api/garment", { headers: { "Sec-Fetch-Site": "cross-site" } }))).toThrow("forbidden_origin");
    expect(() => requireSameOrigin(new Request("https://clara.test/api/garment", { headers: { Origin: "https://clara.test" } }))).not.toThrow();
    expect(() => requireSameOrigin(new Request("https://clara.test/api/garment"))).not.toThrow();
  });

  it("limits paid requests per IP and allows another request after a minute", () => {
    vi.useFakeTimers();
    const req = new Request("https://clara.test/api/garment", { headers: { "X-Forwarded-For": "192.0.2.1" } });
    rateLimit(req, "test", 2);
    rateLimit(req, "test", 2);
    expect(() => rateLimit(req, "test", 2)).toThrow("rate_limited");
    expect(() => rateLimit(new Request("https://clara.test", { headers: { "X-Forwarded-For": "192.0.2.2" } }), "test", 2)).not.toThrow();
    vi.advanceTimersByTime(60_001);
    expect(() => rateLimit(req, "test", 2)).not.toThrow();
  });
});
