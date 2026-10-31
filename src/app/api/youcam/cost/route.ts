// GET /api/youcam/cost: unit cost of each YouCam feature (free call). Dev diagnostics only.

import { NextResponse } from "next/server";
import { getFeatureCost, YouCamError } from "@/lib/youcam/client";

export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return NextResponse.json(await getFeatureCost());
  } catch (err) {
    const e = err as YouCamError;
    return NextResponse.json({ error: e.code ?? "error", message: e.message }, { status: 502 });
  }
}
