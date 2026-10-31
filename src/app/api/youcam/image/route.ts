// GET /api/youcam/image?url=… | ?cached=…: same-origin access to YouCam result images
// so the browser can draw them on a canvas (color measurement, share card).

import { NextResponse, type NextRequest } from "next/server";
import { readCachedImage } from "@/lib/youcam/cache";
import { HttpError } from "@/lib/http";
import { imageType } from "@/lib/image-format";
import { fetchResultImage, verifyResultUrl } from "@/lib/youcam/result-image";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(req: NextRequest) {
  try {
    const cached = req.nextUrl.searchParams.get("cached");
    if (cached) {
      const bytes = await readCachedImage(cached);
      if (!bytes) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const type = imageType(bytes);
      if (!type) return NextResponse.json({ error: "invalid_image" }, { status: 502 });
      return new NextResponse(bytes as BodyInit, { headers: { ...privateHeaders, "Content-Type": type } });
    }

    const url = req.nextUrl.searchParams.get("url") ?? "";
    const signed = req.nextUrl.searchParams.get("signature") ?? "";
    if (!verifyResultUrl(url, signed)) return NextResponse.json({ error: "forbidden_image" }, { status: 403 });
    const { bytes, type } = await fetchResultImage(url);
    return new NextResponse(bytes as BodyInit, { headers: { ...privateHeaders, "Content-Type": type } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof HttpError ? err.code : "image_unavailable" }, {
      status: err instanceof HttpError ? err.status : 502,
      headers: privateHeaders,
    });
  }
}
