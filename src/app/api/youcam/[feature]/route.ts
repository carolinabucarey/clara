// POST /api/youcam/{feature}: uploads the photo(s) to YouCam and starts the task.
// Returns immediately with a task id; the browser polls the status route, so no
// request has to stay open while YouCam works (no serverless timeouts).

import { NextResponse, type NextRequest } from "next/server";
import { cacheKey, readCache } from "@/lib/youcam/cache";
import { createTask, uploadFile, YouCamError } from "@/lib/youcam/client";
import { FEATURE_INPUTS, FEATURES, isFeature, PARAM_SCHEMAS, type Feature } from "@/lib/youcam/features";
import { cachedResponse } from "@/lib/youcam/respond";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

async function fileBytes(form: FormData, name: string) {
  const value = form.get(name);
  if (!value || typeof value === "string") return null;
  if (value.size > MAX_BYTES) throw new YouCamError("exceed_max_filesize", "Image is larger than 8 MB", 413);
  const type = value.type === "image/png" ? "image/png" : "image/jpeg";
  return { bytes: new Uint8Array(await value.arrayBuffer()), type, name: type === "image/png" ? `${name}.png` : `${name}.jpg` };
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/youcam/[feature]">) {
  const { feature } = await ctx.params;
  if (!isFeature(feature)) return NextResponse.json({ error: "unknown_feature" }, { status: 404 });

  try {
    const form = await req.formData();
    const src = await fileBytes(form, "src");
    const ref = FEATURE_INPUTS[feature].ref ? await fileBytes(form, "ref") : null;
    if (!src || (FEATURE_INPUTS[feature].ref && !ref)) {
      return NextResponse.json({ error: "missing_image" }, { status: 400 });
    }
    const rawParams = form.get("params");
    const parsed = PARAM_SCHEMAS[feature].safeParse(rawParams ? JSON.parse(String(rawParams)) : {});
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_parameter", detail: parsed.error.issues }, { status: 400 });
    }
    const params = parsed.data;

    const key = cacheKey(feature, [src.bytes, ...(ref ? [ref.bytes] : [])], params);
    const cached = await readCache(key);
    if (cached) return NextResponse.json(cachedResponse(feature, key, cached));

    const run = async (f: Feature, p: Record<string, unknown>) => {
      const [srcId, refId] = await Promise.all([
        uploadFile(f, src.bytes, src.type, src.name),
        ref ? uploadFile(f, ref.bytes, ref.type, ref.name) : Promise.resolve(null),
      ]);
      return createTask(f, { src_file_id: srcId, ...(refId ? { ref_file_id: refId } : {}), ...p });
    };

    let used: Feature = feature;
    let taskId: string;
    try {
      taskId = await run(feature, params);
    } catch (err) {
      // cloth-v4 is the newest engine; fall back to the classic one if it rejects the request.
      if (feature !== FEATURES.cloth || !(err instanceof YouCamError) || ![400, 404].includes(err.httpStatus)) throw err;
      used = FEATURES.clothLegacy;
      const category = params.garment_category === "outer" ? "upper_body" : params.garment_category;
      taskId = await run(used, { garment_category: category, change_shoes: params.change_shoes });
    }
    return NextResponse.json({ status: "running", feature: used, taskId, key });
  } catch (err) {
    const e = err instanceof YouCamError ? err : new YouCamError("unknown_internal_error", (err as Error).message);
    console.error(`[youcam:${feature}]`, e.code, e.message);
    return NextResponse.json({ status: "error", code: e.code }, { status: e.httpStatus >= 400 ? e.httpStatus : 500 });
  }
}
