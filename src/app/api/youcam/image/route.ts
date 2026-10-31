// GET /api/youcam/image?url=… | ?cached=…: same-origin access to YouCam result images
// so the browser can draw them on a canvas (color measurement, share card).

import { NextResponse, type NextRequest } from "next/server";
import { readCachedImage } from "@/lib/youcam/cache";
import { isYouCamResultUrl } from "@/lib/youcam/client";

function sniff(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

export async function GET(req: NextRequest) {
  const cached = req.nextUrl.searchParams.get("cached");
  if (cached) {
    const bytes = await readCachedImage(cached);
    if (!bytes) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new NextResponse(bytes as BodyInit, {
      headers: { "Content-Type": sniff(bytes), "Cache-Control": "private, max-age=3600" },
    });
  }

  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!isYouCamResultUrl(url)) return NextResponse.json({ error: "forbidden_host" }, { status: 400 });
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "expired" }, { status: 410 });
  const bytes = new Uint8Array(await res.arrayBuffer());
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? sniff(bytes),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
