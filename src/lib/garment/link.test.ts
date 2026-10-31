import { afterEach, describe, expect, it, vi } from "vitest";
import { extractProductImages, isPrivateAddress, safeFetch } from "./link";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "23.45.67.89", family: 4 }] }));

const page = (head: string) => `<html><head>${head}</head><body></body></html>`;

describe("product photos from a store page", () => {
  it("prefers the JSON-LD product gallery, then the preview tags, without duplicates", () => {
    const html = page(`
      <title>Vestido · Tienda</title>
      <meta content="https://cdn.shop/og.webp" property="og:image"/>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Vestido Zara","image":["https://cdn.shop/a.webp",{"url":"/b.jpg"},"https://cdn.shop/og.webp"]}]}</script>`);
    expect(extractProductImages(html, "https://shop.example/articulo/vestido")).toEqual({
      title: "Vestido Zara",
      images: ["https://cdn.shop/a.webp", "https://shop.example/b.jpg", "https://cdn.shop/og.webp"],
    });
  });

  it("falls back to og/twitter tags and the page title, decoding entities", () => {
    const html = page(`<title>Blusa &amp; Co</title><meta name="twitter:image" content="https://cdn.shop/t.jpg?w=1&amp;h=2">`);
    expect(extractProductImages(html, "https://shop.example/p")).toEqual({ title: "Blusa & Co", images: ["https://cdn.shop/t.jpg?w=1&h=2"] });
  });

  it("finds nothing on a page without product data", () => {
    expect(extractProductImages(page("<title>Inicio</title>"), "https://shop.example/").images).toEqual([]);
  });
});

describe("private address guard", () => {
  it("blocks loopback, private, link-local and CGNAT addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["104.18.10.1", "8.8.8.8", "2606:4700::6810:84e5"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});

describe("store fetch", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (status: number) => vi.stubGlobal("fetch", async () => new Response("<h1>Access Denied</h1>", { status }));
  const get = () => safeFetch("https://www.zara.com/cl/es/p.html", { accept: "text/html", maxBytes: 1000 });

  it("says the store blocked us when it refuses the request, so the person isn't told to retry", async () => {
    for (const status of [401, 403, 429]) {
      answer(status);
      await expect(get()).rejects.toMatchObject({ code: "linkBlocked" });
    }
  });
  it("keeps other failures as unreachable", async () => {
    answer(503);
    await expect(get()).rejects.toMatchObject({ code: "linkUnreachable" });
  });
});
