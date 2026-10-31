// POST /api/garment: reads the garment's construction (type, neckline, length, fit…)
// with Claude vision. The user confirms or corrects every attribute in the UI.

import { NextResponse } from "next/server";
import { hasClaude } from "@/lib/claude/client";
import { DEFAULT_ATTRIBUTES, readGarment, toAttributes } from "@/lib/garment/read";

export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file === "string") return NextResponse.json({ error: "missing_image" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "exceed_max_filesize" }, { status: 413 });

  if (!hasClaude()) {
    return NextResponse.json({ attributes: DEFAULT_ATTRIBUTES, isGarment: true, source: "default" });
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const read = await readGarment(bytes, file.type === "image/png" ? "image/png" : "image/jpeg");
    return NextResponse.json({ attributes: toAttributes(read), isGarment: read.is_garment, source: "claude" });
  } catch (err) {
    console.error("[garment] read failed:", (err as Error).message);
    return NextResponse.json({ attributes: DEFAULT_ATTRIBUTES, isGarment: true, source: "default" });
  }
}
