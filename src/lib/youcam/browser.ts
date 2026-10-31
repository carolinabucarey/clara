"use client";

// Browser side of the YouCam integration: start a task through our API route and
// poll until it finishes. The API key never reaches the browser.

import type { Feature } from "./features";
import type { FaceShape } from "../types";

export interface YouCamResult {
  feature: Feature;
  results: Record<string, unknown>;
  imageUrl: string | null;
  cached?: boolean;
}

export class YouCamTaskError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "YouCamTaskError";
  }
}

const POLL_MS = 2500;
const TIMEOUT_MS = 120_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

async function json(res: Response) {
  try {
    return await res.json();
  } catch {
    return { status: "error", code: `http_${res.status}` };
  }
}

export async function runYouCam(
  feature: Feature,
  input: { src: Blob; ref?: Blob; params?: Record<string, unknown> },
  signal?: AbortSignal,
): Promise<YouCamResult> {
  const form = new FormData();
  form.append("src", input.src, input.src.type === "image/png" ? "src.png" : "src.jpg");
  if (input.ref) form.append("ref", input.ref, input.ref.type === "image/png" ? "ref.png" : "ref.jpg");
  form.append("params", JSON.stringify(input.params ?? {}));

  const start = await json(await fetch(`/api/youcam/${feature}`, { method: "POST", body: form, signal }));
  if (start.status === "success") return start as YouCamResult;
  if (start.status !== "running") throw new YouCamTaskError(start.code ?? start.error ?? "generic");

  const used: Feature = start.feature;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS, signal);
    const res = await fetch(`/api/youcam/${used}/${encodeURIComponent(start.taskId)}?key=${start.key ?? ""}`, {
      signal,
      cache: "no-store",
    });
    const state = await json(res);
    if (state.status === "success") return state as YouCamResult;
    if (state.status === "error") throw new YouCamTaskError(state.code ?? "generic");
  }
  throw new YouCamTaskError("timeout");
}

/** Colors returned by skin-tone-analysis (field names vary slightly across versions). */
export function readSkinTone(results: Record<string, unknown>) {
  const color = ((results.color as Record<string, unknown>) ?? results) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = color[k] ?? results[k];
      if (typeof v === "string" && /^#?[0-9a-f]{6}$/i.test(v)) return v.startsWith("#") ? v : `#${v}`;
    }
    return null;
  };
  const quality = (results.face_quality ?? (results as Record<string, unknown>).faceQuality) as
    | Record<string, unknown>
    | undefined;
  const lightingRaw = String(quality?.lighting ?? "").toLowerCase();
  const lighting: "good" | "ok" | "poor" | undefined = !lightingRaw
    ? undefined
    : /bad|poor|dark|low|insufficient|uneven|false/.test(lightingRaw)
      ? "poor"
      : "good";
  return {
    skin: pick("skin_color", "skinColor", "skin"),
    hair: pick("hair_color", "hairColor"),
    eye: pick("eye_color", "eyeColor"),
    lip: pick("lip_color", "lipColor"),
    lighting,
  };
}

/** First value found under `key` at any depth of a result object. */
function findKey(value: unknown, key: string, depth = 0): unknown {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  const obj = value as Record<string, unknown>;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findKey(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

const FACE_SHAPES: Record<string, FaceShape> = {
  oval: "oval",
  round: "round",
  square: "square",
  heart: "heart",
  oblong: "oblong",
  diamond: "diamond",
  triangle: "triangle",
  invtriangle: "inv_triangle",
};

/** Face shape and width÷height from face-attr-analysis; null when YouCam couldn't tell. */
export function readFaceShape(results: Record<string, unknown>): { shape: FaceShape; aspect: number | null } | null {
  const raw = findKey(results, "faceshape");
  const shape = typeof raw === "string" ? FACE_SHAPES[raw.toLowerCase().replace(/[^a-z]/g, "")] : undefined;
  if (!shape) return null;
  const ratio = findKey(results, "face_aspect_ratio");
  const aspect =
    Array.isArray(ratio) && typeof ratio[0] === "number" && typeof ratio[1] === "number" && ratio[1] > 0
      ? Math.round((ratio[0] / ratio[1]) * 100) / 100
      : null;
  return { shape, aspect };
}
