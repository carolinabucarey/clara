// POST /api/garment/link {url}: the product photos found on a store page.
// GET  /api/garment/link?image=…: one of those photos, same-origin, so the browser
// can measure and try it on like an uploaded screenshot.

import { NextResponse, type NextRequest } from "next/server";
import { extractProductImages, LinkError, safeFetch } from "@/lib/garment/link";
import { HttpError, rateLimit, readJson, requireSameOrigin } from "@/lib/http";
import { storeImageType } from "@/lib/image-format";

export const maxDuration = 30;

const fail = (e: unknown) => {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.status === 429 ? "linkBlocked" : "linkInvalid" }, { status: e.status });
  }
  const code = e instanceof LinkError ? e.code : "linkUnreachable";
  if (!(e instanceof LinkError)) console.error("[garment:link]", (e as Error).message);
  return NextResponse.json({ error: code }, { status: code === "linkInvalid" ? 400 : 422 });
};

export async function POST(req: NextRequest) {
  try {
    requireSameOrigin(req);
    rateLimit(req, "garment-link");
    const body = await readJson(req, 8 * 1024) as { url?: unknown } | null;
    if (!body || typeof body.url !== "string" || body.url.length > 2048) throw new LinkError("linkInvalid");
    const page = await safeFetch(body.url.trim(), { accept: "text/html,application/xhtml+xml,image/*", maxBytes: 3_000_000 });
    // A direct link to a photo works too.
    if (page.contentType.startsWith("image/")) return NextResponse.json({ title: null, images: [page.finalUrl] });
    const html = new TextDecoder().decode(page.bytes);
    const found = extractProductImages(html, page.finalUrl);
    if (found.images.length === 0) throw new LinkError("linkNoImage");
    return NextResponse.json(found);
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    requireSameOrigin(req);
    rateLimit(req, "garment-link-image");
    const image = req.nextUrl.searchParams.get("image");
    if (!image || image.length > 8192) throw new LinkError("linkInvalid");
    const res = await safeFetch(image, { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", maxBytes: 8_000_000 });
    const type = storeImageType(res.bytes);
    if (!type) throw new LinkError("linkNoImage");
    return new NextResponse(res.bytes as BodyInit, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
