// POST /api/garment/link {url}: the product photos found on a store page.
// GET  /api/garment/link?image=…: one of those photos, same-origin, so the browser
// can measure and try it on like an uploaded screenshot.

import { NextResponse, type NextRequest } from "next/server";
import { extractProductImages, LinkError, safeFetch } from "@/lib/garment/link";

export const maxDuration = 30;

const fail = (e: unknown) => {
  const code = e instanceof LinkError ? e.code : "linkUnreachable";
  if (!(e instanceof LinkError)) console.error("[garment:link]", (e as Error).message);
  return NextResponse.json({ error: code }, { status: code === "linkInvalid" ? 400 : 422 });
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { url?: unknown };
    if (typeof body.url !== "string" || body.url.length > 2048) throw new LinkError("linkInvalid");
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
    const image = req.nextUrl.searchParams.get("image");
    if (!image) throw new LinkError("linkInvalid");
    const res = await safeFetch(image, { accept: "image/avif,image/webp,image/png,image/jpeg,image/*", maxBytes: 8_000_000 });
    if (!res.contentType.startsWith("image/")) throw new LinkError("linkNoImage");
    return new NextResponse(res.bytes as BodyInit, {
      headers: { "Content-Type": res.contentType, "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return fail(e);
  }
}
