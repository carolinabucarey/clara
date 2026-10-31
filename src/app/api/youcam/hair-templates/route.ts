// GET /api/youcam/hair-templates: YouCam's hairstyle templates (id, title, thumbnail).
// The catalog changes rarely, so it is kept in memory for an hour.

import { connection, NextResponse } from "next/server";
import { listTemplates, YouCamError, type Template } from "@/lib/youcam/client";
import { FEATURES } from "@/lib/youcam/features";

const TTL_MS = 60 * 60 * 1000;
let cached: { at: number; templates: Template[] } | null = null;

export async function GET() {
  await connection(); // always at request time: the catalog needs the API key, never baked into the build
  try {
    if (!cached || Date.now() - cached.at > TTL_MS) {
      cached = { at: Date.now(), templates: await listTemplates(FEATURES.hairTransfer) };
    }
    return NextResponse.json(
      { templates: cached.templates },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (err) {
    const e = err instanceof YouCamError ? err : new YouCamError("unknown_internal_error", (err as Error).message);
    console.error("[youcam:hair-templates]", e.code, e.message);
    return NextResponse.json({ status: "error", code: e.code }, { status: e.httpStatus >= 400 ? e.httpStatus : 500 });
  }
}
