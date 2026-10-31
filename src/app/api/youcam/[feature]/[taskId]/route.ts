// GET /api/youcam/{feature}/{taskId}?key=…: one status check of a YouCam task.

import { NextResponse, type NextRequest } from "next/server";
import { getTask, resultImageUrl, YouCamError } from "@/lib/youcam/client";
import { cacheEnabled, writeCache } from "@/lib/youcam/cache";
import { isFeature } from "@/lib/youcam/features";
import { proxiedUrl } from "@/lib/youcam/respond";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/youcam/[feature]/[taskId]">) {
  const { feature, taskId } = await ctx.params;
  if (!isFeature(feature)) return NextResponse.json({ error: "unknown_feature" }, { status: 404 });
  const key = req.nextUrl.searchParams.get("key") ?? "";

  try {
    const state = await getTask(feature, taskId);
    if (state.status !== "success") return NextResponse.json(state);

    const remote = resultImageUrl(state.results);
    let imageUrl: string | null = remote ? proxiedUrl(remote) : null;
    if (cacheEnabled() && key) {
      let bytes: Uint8Array | null = null;
      if (remote) {
        const res = await fetch(remote);
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
      }
      await writeCache(key, state.results, bytes);
      if (bytes) imageUrl = `/api/youcam/image?cached=${key}`;
    }
    return NextResponse.json({ status: "success", feature, results: state.results, imageUrl });
  } catch (err) {
    const e = err instanceof YouCamError ? err : new YouCamError("unknown_internal_error", (err as Error).message);
    console.error(`[youcam:${feature}:status]`, e.code, e.message);
    return NextResponse.json({ status: "error", code: e.code }, { status: e.httpStatus >= 400 ? e.httpStatus : 500 });
  }
}
