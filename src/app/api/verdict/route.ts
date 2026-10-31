// POST /api/verdict: deterministic rules decide; Claude only writes the text.

import { NextResponse } from "next/server";
import { describeGarmentColor } from "@/lib/color/garment";
import { buildVerdict } from "@/lib/verdict";
import { draftVerdict } from "@/lib/verdict/draft";
import { VerdictRequestSchema } from "@/lib/verdict/schema";

export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = VerdictRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.issues }, { status: 400 });
  }
  const { locale, goals, profile, proportions, garment, garmentColor } = parsed.data;
  // Recompute the color description server-side rather than trusting the client's labels.
  const color = describeGarmentColor(garmentColor.hex, garmentColor.share);
  const input = { profile, proportions, garment, garmentColor: color, goals };
  const result = buildVerdict(input);
  const draft = await draftVerdict(locale, input, result);
  return NextResponse.json({ result, draft });
}
