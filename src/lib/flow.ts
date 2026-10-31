"use client";

// Orchestration of each step in the browser: prepares photos, calls MediaPipe
// locally, calls YouCam through our API routes, and builds the measured data.

import { buildColorProfile } from "./color/profile";
import { DEFAULT_ATTRIBUTES } from "./garment/defaults";
import { dominantColors, looksMulticolor } from "./color/dominant";
import { describeGarmentColor } from "./color/garment";
import { faceCrop, getPixels, loadImage, prepareUpload, toCanvas, type Rect } from "./image";
import { measureBody, PoseMeasurementError, LM, type Landmark } from "./pose/measure";
import { detectFaces, detectPose } from "./pose/vision";
import { readSkinTone, runYouCam, YouCamTaskError } from "./youcam/browser";
import { FEATURES, lipstickEffect } from "./youcam/features";
import { errorKey } from "./youcam/errors";
import type { Locale } from "./i18n";
import type {
  ColorProfile,
  GarmentAttributes,
  GarmentCategory,
  GarmentColor,
  Goal,
  Proportions,
  VerdictDraft,
  VerdictResult,
} from "./types";

export class FlowError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "FlowError";
  }
}

/** i18n key (under `errors`) for any error thrown by the flow. */
export function errorCode(err: unknown): string {
  if (err instanceof YouCamTaskError) return errorKey(err.code);
  if (err instanceof FlowError || err instanceof PoseMeasurementError) return err.code;
  return "generic";
}

// ---------------------------------------------------------------- garment

export interface GarmentAnalysis {
  id: string;
  originalUrl: string;
  upload: Blob;
  isolatedUrl: string | null;
  clusters: Array<{ hex: string; share: number }>;
  multicolor: boolean;
  color: GarmentColor;
  attrs: GarmentAttributes;
  isGarment: boolean;
  attrsSource: "claude" | "default";
}

async function readAttributes(blob: Blob) {
  const form = new FormData();
  form.append("image", blob, "garment.jpg");
  const res = await fetch("/api/garment", { method: "POST", body: form });
  if (!res.ok) throw new FlowError("generic");
  return (await res.json()) as { attributes: GarmentAttributes; isGarment: boolean; source: "claude" | "default" };
}

/** Region where the garment is worn, when the product photo shows it on a model. */
function wornRegion(lm: Landmark[], category: GarmentCategory): Rect | null {
  const pts = (ids: number[]) => ids.map((i) => lm[i]).filter((l) => l && (l.visibility ?? 1) > 0.4);
  const sh = pts([LM.leftShoulder, LM.rightShoulder]);
  const hp = pts([LM.leftHip, LM.rightHip]);
  if (sh.length < 2 || hp.length < 2) return null;
  const shY = (sh[0].y + sh[1].y) / 2;
  const hipY = (hp[0].y + hp[1].y) / 2;
  const torso = hipY - shY;
  const minX = Math.min(...sh.map((p) => p.x), ...hp.map((p) => p.x));
  const maxX = Math.max(...sh.map((p) => p.x), ...hp.map((p) => p.x));
  const knees = pts([25, 26]);
  const kneeY = knees.length === 2 ? (knees[0].y + knees[1].y) / 2 : hipY + torso;
  if (category === "lower_body") {
    const x = Math.min(...hp.map((p) => p.x));
    const w = Math.max(...hp.map((p) => p.x)) - x;
    return { x: x - w * 0.6, y: hipY - torso * 0.1, width: w * 2.2, height: kneeY - hipY + torso * 0.3 };
  }
  const bottom = category === "full_body" ? kneeY : hipY + torso * 0.1;
  const pad = (maxX - minX) * 0.05;
  return { x: minX + pad, y: shY + torso * 0.08, width: maxX - minX - pad * 2, height: bottom - shY - torso * 0.08 };
}

export async function measureGarmentColors(
  imageUrl: string,
  attrs: GarmentAttributes,
  originalForPose: HTMLCanvasElement,
) {
  const img = await loadImage(imageUrl);
  const canvas = toCanvas(img, 500);
  let region: Rect | undefined;
  if (attrs.shownOn === "model") {
    const pose = await detectPose(originalForPose).catch(() => null);
    const r = pose ? wornRegion(pose.landmarks, attrs.category) : null;
    if (r) region = { x: r.x * canvas.width, y: r.y * canvas.height, width: r.width * canvas.width, height: r.height * canvas.height };
  }
  const px = getPixels(canvas);
  const clusters = dominantColors(px.data, px.width, px.height, { k: 4, region });
  // Anti-aliased edges and shadows form tiny clusters: only offer colors that cover a real part of the garment.
  const visible = clusters.filter((c, i) => i === 0 || c.share >= 0.06).slice(0, 4);
  return { clusters: visible.map((c) => ({ hex: c.hex, share: c.share })), multicolor: looksMulticolor(clusters) };
}

export async function analyzeGarment(file: Blob, onStage?: (s: "reading" | "isolating") => void): Promise<GarmentAnalysis> {
  const img = await loadImage(file).catch(() => {
    throw new FlowError("imageUnreadable");
  });
  const full = await prepareUpload(img, 1600);
  const small = await prepareUpload(img, 1024);
  onStage?.("reading");

  const [read, sod] = await Promise.all([
    readAttributes(small.blob).catch(() => null),
    (async () => {
      onStage?.("isolating");
      return runYouCam(FEATURES.removeBackground, { src: full.blob }).catch((e) => {
        console.warn("background removal failed, measuring on the original", e);
        return null;
      });
    })(),
  ]);

  const attrs = read?.attributes ?? DEFAULT_ATTRIBUTES;
  const originalUrl = URL.createObjectURL(full.blob);
  const isolatedUrl = sod?.imageUrl ?? null;
  const measured = await measureGarmentColors(isolatedUrl ?? originalUrl, attrs, full.canvas);
  if (measured.clusters.length === 0) throw new FlowError("imageUnreadable");
  const top = measured.clusters[0];
  return {
    id: `${Date.now()}`,
    originalUrl,
    upload: full.blob,
    isolatedUrl,
    clusters: measured.clusters,
    multicolor: measured.multicolor,
    color: describeGarmentColor(top.hex, top.share),
    attrs,
    isGarment: read?.isGarment ?? true,
    attrsSource: read?.source ?? "default",
  };
}

// ---------------------------------------------------------------- you

export interface SelfieAnalysis {
  profile: ColorProfile;
  selfieBlob: Blob;
  selfieUrl: string;
}

export async function analyzeSelfie(file: Blob): Promise<SelfieAnalysis> {
  const img = await loadImage(file).catch(() => {
    throw new FlowError("imageUnreadable");
  });
  const canvas = toCanvas(img, 1600);
  const faces = await detectFaces(canvas);
  if (faces.length === 0) throw new FlowError("no_face_local");
  if (faces.length > 1 && faces[1].width > faces[0].width * 0.6) throw new FlowError("multiplePeople");
  const crop = faceCrop(faces[0], canvas.width, canvas.height);
  if (faces[0].width < 100) throw new FlowError("faceTooSmall");
  const prepared = await prepareUpload(canvas, 1024, crop);

  const res = await runYouCam(FEATURES.skinTone, {
    src: prepared.blob,
    params: { face_angle_strictness_level: "medium" },
  });
  const colors = readSkinTone(res.results);
  if (!colors.skin) throw new FlowError("noFace");
  const profile = buildColorProfile(
    { skin: colors.skin, hair: colors.hair, eye: colors.eye, lip: colors.lip },
    { lighting: colors.lighting },
  );
  return { profile, selfieBlob: prepared.blob, selfieUrl: URL.createObjectURL(prepared.blob) };
}

export interface BodyAnalysis {
  proportions: Proportions;
  bodyBlob: Blob;
  bodyUrl: string;
}

export async function analyzeBody(file: Blob, heightCm: number, looseClothing: boolean): Promise<BodyAnalysis> {
  const img = await loadImage(file).catch(() => {
    throw new FlowError("imageUnreadable");
  });
  const prepared = await prepareUpload(img, 1600);
  const pose = await detectPose(prepared.canvas);
  if (!pose) throw new FlowError("pose_not_found");
  const proportions = measureBody({ landmarks: pose.landmarks, mask: pose.mask, heightCm, looseClothing });
  return { proportions, bodyBlob: prepared.blob, bodyUrl: URL.createObjectURL(prepared.blob) };
}

// ---------------------------------------------------------------- try-on and rescue

export async function tryOn(body: Blob, garment: Blob, category: GarmentCategory, signal?: AbortSignal) {
  const res = await runYouCam(
    FEATURES.cloth,
    { src: body, ref: garment, params: { garment_category: category, change_shoes: false, filter_multi_person: "normal" } },
    signal,
  );
  if (!res.imageUrl) throw new FlowError("generic");
  return res.imageUrl;
}

/** Applies a lipstick with YouCam makeup try-on, on the try-on photo when the face is big enough. */
export async function applyLipstick(hex: string, tryOnUrl: string | null, selfie: Blob) {
  let src = selfie;
  if (tryOnUrl) {
    try {
      const img = await loadImage(tryOnUrl);
      const canvas = toCanvas(img, 1600);
      const faces = await detectFaces(canvas);
      if (faces[0] && faces[0].width >= 110) src = (await prepareUpload(canvas, 1600)).blob;
    } catch {
      /* fall back to the selfie */
    }
  }
  const res = await runYouCam(FEATURES.makeup, { src, params: lipstickEffect(hex) });
  if (!res.imageUrl) throw new FlowError("generic");
  return { url: res.imageUrl, beforeUrl: src === selfie ? URL.createObjectURL(selfie) : tryOnUrl! };
}

// ---------------------------------------------------------------- verdict

export async function requestVerdict(body: {
  locale: Locale;
  profile: ColorProfile;
  proportions: Proportions;
  garment: GarmentAttributes;
  garmentColor: GarmentColor;
  goals: Goal[];
}): Promise<{ result: VerdictResult; draft: VerdictDraft }> {
  const res = await fetch("/api/verdict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new FlowError("generic");
  return res.json();
}
