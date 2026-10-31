// POST /api/garment: reads the garment's construction (type, neckline, length, fit…)
// with Claude vision. The user confirms or corrects every attribute in the UI.

import { NextResponse } from "next/server";
import { hasClaude } from "@/lib/claude/client";
import { DEFAULT_ATTRIBUTES, readGarment, toAttributes } from "@/lib/garment/read";
import { HttpError, rateLimit, readForm, readImageFile, requireSameOrigin } from "@/lib/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  let image;
  try {
    requireSameOrigin(req);
    rateLimit(req, "garment");
    const form = await readForm(req, 5 * 1024 * 1024 + 64 * 1024);
    image = await readImageFile(form, "image", 5 * 1024 * 1024);
    if (!image) return NextResponse.json({ error: "missing_image" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof HttpError ? err.code : "invalid_request" }, { status: err instanceof HttpError ? err.status : 400 });
  }

  if (!hasClaude()) {
    return NextResponse.json({ attributes: DEFAULT_ATTRIBUTES, isGarment: true, source: "default" });
  }
  try {
    const read = await readGarment(image.bytes, image.type);
    return NextResponse.json({ attributes: toAttributes(read), isGarment: read.is_garment, source: "claude" });
  } catch (err) {
    console.error("[garment] read failed:", (err as Error).message);
    return NextResponse.json({ attributes: DEFAULT_ATTRIBUTES, isGarment: true, source: "default" });
  }
}
