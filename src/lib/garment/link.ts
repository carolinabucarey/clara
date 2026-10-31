// Product photos from a store link: the page's product data (JSON-LD), then its
// social preview tags (og:image, twitter:image). Server-only: pages are fetched
// with guards so a link can't reach private networks.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class LinkError extends Error {
  constructor(public code: "linkInvalid" | "linkUnreachable" | "linkNoImage") {
    super(code);
    this.name = "LinkError";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", "#39": "'", "#x2F": "/" };
const decode = (s: string) => s.replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m);

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

/** Images and name of every schema.org Product in the page's JSON-LD blocks. */
function productData(html: string): { images: string[]; name: string | null } {
  const images: string[] = [];
  let name: string | null = null;
  const visit = (node: unknown, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
      if (!name && typeof o.name === "string") name = o.name;
      const add = (img: unknown) => {
        if (typeof img === "string") images.push(img);
        else if (Array.isArray(img)) img.forEach(add);
        else if (img && typeof img === "object" && typeof (img as { url?: unknown }).url === "string") images.push((img as { url: string }).url);
      };
      add(o.image);
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, depth + 1);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      /* a broken block shouldn't hide the others */
    }
  }
  return { images, name };
}

/** Candidate product photos (best first) and a title, resolved against the page URL. */
export function extractProductImages(html: string, pageUrl: string): { title: string | null; images: string[] } {
  const product = productData(html);
  const meta: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
  }
  const linkImage = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0])).find((a) => a.rel === "image_src")?.href;

  const raw = [
    ...product.images,
    meta["og:image:secure_url"],
    meta["og:image"],
    meta["twitter:image"],
    meta["twitter:image:src"],
    linkImage,
  ];
  const images: string[] = [];
  for (const r of raw) {
    if (!r) continue;
    try {
      const u = new URL(r.trim(), pageUrl);
      if ((u.protocol === "https:" || u.protocol === "http:") && !images.includes(u.href)) images.push(u.href);
    } catch {
      /* skip unparseable */
    }
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = product.name ?? meta["og:title"] ?? (titleTag ? decode(titleTag.trim()) : null);
  return { title: title?.slice(0, 160) ?? null, images: images.slice(0, 8) };
}

/** Loopback, private, link-local, CGNAT and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || /^fe[89ab]/.test(v6);
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new LinkError("linkInvalid");
  if (url.username || url.password) throw new LinkError("linkInvalid");
  if (url.port && !["80", "443"].includes(url.port)) throw new LinkError("linkInvalid");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(host)) throw new LinkError("linkInvalid");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new LinkError("linkUnreachable");
  if (addresses.some(isPrivateAddress)) throw new LinkError("linkInvalid");
}

const UA = "Mozilla/5.0 (compatible; ClaraLinkPreview/1.0)";

/** GET with the guards above on every redirect hop, a timeout and a size cap. */
export async function safeFetch(rawUrl: string, opts: { accept: string; maxBytes: number; timeoutMs?: number }) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new LinkError("linkInvalid");
  }
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: opts.accept },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      cache: "no-store",
    }).catch(() => {
      throw new LinkError("linkUnreachable");
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok || !res.body) throw new LinkError("linkUnreachable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > opts.maxBytes) {
        await reader.cancel();
        throw new LinkError(opts.accept.startsWith("image") ? "linkNoImage" : "linkUnreachable");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { bytes, contentType: res.headers.get("content-type") ?? "", finalUrl: url.href };
  }
  throw new LinkError("linkUnreachable");
}
