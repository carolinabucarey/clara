"use client";

// Orchestration of each step in the browser: prepares photos, calls MediaPipe
// locally, calls YouCam through our API routes, and builds the measured data.

import { buildColorProfile } from "./color/profile";
import { DEFAULT_ATTRIBUTES } from "./garment/defaults";
import { dominantColors, looksMulticolor } from "./color/dominant";
import { flattenOnto, recolorPixels } from "./color/recolor";
import { hairColorChanged, hairStats, transferHairColor } from "./color/hair";
import { describeGarmentColor } from "./color/garment";
import { canvasToBlob, faceCrop, getPixels, loadImage, prepareUpload, toCanvas, type Rect } from "./image";
import { measureBody, PoseMeasurementError, LM, type Landmark } from "./pose/measure";
import { detectFaces, detectPose, segmentHair } from "./pose/vision";
import { fidelityIssues, meanDeltaE, type FidelityIssue } from "./pose/fidelity";
import { readFaceShape, readSkinTone, runYouCam, YouCamTaskError } from "./youcam/browser";
import { FACE_ATTRIBUTES, FEATURES, lipstickEffect, type MakeupEffect } from "./youcam/features";
import { errorKey } from "./youcam/errors";
import type { Locale } from "./i18n";
import type {
  ColorProfile,
  FaceShapeReading,
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
  /** The store page it came from, when it was added from a link. */
  source?: { url: string; title: string | null };
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
  /** Head and shoulders, JPEG ≤ 1024 px: the framing YouCam's hairstyle try-on asks for. */
  selfieWideBlob: Blob;
  selfieWideUrl: string;
  /** null when YouCam couldn't read the face shape; the person can still choose it. */
  faceShape: FaceShapeReading | null;
}

/** Head-and-shoulders crop around a detected face. */
function portraitCrop(face: Rect, imgW: number, imgH: number): Rect {
  const width = Math.min(imgW, face.width * 3.2);
  const height = Math.min(imgH, width * 1.25);
  const x = Math.max(0, Math.min(imgW - width, face.x + face.width / 2 - width / 2));
  const y = Math.max(0, Math.min(imgH - height, face.y - face.height * 0.8));
  return { x, y, width, height };
}

/** Face shape with YouCam's face analyzer (the photo must be a tight face crop). */
export async function analyzeFaceShape(faceBlob: Blob): Promise<FaceShapeReading | null> {
  const res = await runYouCam(FEATURES.faceAnalyzer, {
    src: faceBlob,
    params: { features: [...FACE_ATTRIBUTES], face_angle_strictness_level: "medium" },
  });
  const read = readFaceShape(res.results);
  return read ? { shape: read.shape, measured: read.shape, aspect: read.aspect } : null;
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
  const wide = await prepareUpload(canvas, 1024, portraitCrop(faces[0], canvas.width, canvas.height));

  const [res, faceShape] = await Promise.all([
    runYouCam(FEATURES.skinTone, { src: prepared.blob, params: { face_angle_strictness_level: "medium" } }),
    // The face shape only feeds hairstyle advice: never block the profile on it.
    analyzeFaceShape(prepared.blob).catch((e) => {
      console.warn("face shape analysis failed", e);
      return null;
    }),
  ]);
  const colors = readSkinTone(res.results);
  if (!colors.skin) throw new FlowError("noFace");
  const profile = buildColorProfile(
    { skin: colors.skin, hair: colors.hair, eye: colors.eye, lip: colors.lip },
    { lighting: colors.lighting },
  );
  return {
    profile,
    selfieBlob: prepared.blob,
    selfieUrl: URL.createObjectURL(prepared.blob),
    selfieWideBlob: wide.blob,
    selfieWideUrl: URL.createObjectURL(wide.blob),
    faceShape,
  };
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

/** Tries a garment on over an earlier try-on result, to build an outfit piece by piece. */
export async function tryOnOver(baseUrl: string, garment: Blob, category: GarmentCategory, signal?: AbortSignal) {
  // YouCam result links expire after a couple of hours; callers fall back to the body photo.
  const img = await loadImage(baseUrl).catch(() => {
    throw new FlowError("baseExpired");
  });
  const base = await prepareUpload(img, 1600);
  return tryOn(base.blob, garment, category, signal);
}

/**
 * Outfit try-on: YouCam changes one garment category per task, so the pieces are
 * applied in sequence, starting from an existing result when there is one.
 */
export async function tryOnOutfit(
  body: Blob,
  baseUrl: string | null,
  steps: Array<{ garment: Blob; category: GarmentCategory }>,
  signal?: AbortSignal,
  /** Every piece of the look, used if the base image has expired. */
  allSteps = steps,
): Promise<string> {
  let url = baseUrl;
  if (url && steps.length > 0) {
    try {
      url = await tryOnOver(url, steps[0].garment, steps[0].category, signal);
      steps = steps.slice(1);
    } catch (e) {
      if (!(e instanceof FlowError && e.code === "baseExpired")) throw e;
      return tryOnOutfit(body, null, allSteps, signal); // start again from the body photo

    }
  }
  for (const s of steps) {
    url = url ? await tryOnOver(url, s.garment, s.category, signal) : await tryOn(body, s.garment, s.category, signal);
  }
  if (!url) throw new FlowError("generic");
  return url;
}

/**
 * Hairstyle try-on on a head-and-shoulders photo, keeping the person's own hair color.
 * YouCam's "src" color is its own reading of the photo and can be far off (dark hair
 * coming back platinum), so unless the template brings its own color on purpose, the
 * hair is measured before and after and the original color is put back if it moved.
 */
export async function applyHairstyle(src: Blob, templateId: string, keepColor = true) {
  const res = await runYouCam(FEATURES.hairTransfer, { src, params: { template_id: templateId, hair_color: "src" } });
  if (!res.imageUrl) throw new FlowError("generic");
  if (!keepColor) return res.imageUrl;
  const restored = await restoreHairColor(src, res.imageUrl).catch((e) => {
    console.warn("hair color check failed", e);
    return null;
  });
  return restored ?? res.imageUrl;
}

/** The try-on with the person's hair color put back, or null when it kept it (local, no API cost). */
async function restoreHairColor(src: Blob, resultUrl: string): Promise<string | null> {
  const [before, after] = await Promise.all([loadImage(src), loadImage(resultUrl)]);
  const a = toCanvas(before, 1024);
  const b = toCanvas(after, 1024);
  const maskA = await segmentHair(a);
  const maskB = await segmentHair(b);
  if (!maskA || !maskB) return null;
  const pa = getPixels(a);
  const pb = getPixels(b);
  const own = hairStats(pa.data, a.width, a.height, maskA);
  const now = hairStats(pb.data, b.width, b.height, maskB);
  if (!own || !now || !hairColorChanged(own, now)) return null;
  // The wrong color is often a near-white that the first read half misses.
  const all = (await segmentHair(b, { lightHair: true })) ?? maskB;
  transferHairColor(pb.data, b.width, b.height, all, hairStats(pb.data, b.width, b.height, all) ?? now, own);
  b.getContext("2d")!.putImageData(pb, 0, 0);
  return URL.createObjectURL(await canvasToBlob(b, "image/jpeg", 0.92));
}

/** The suggested makeup, on the hairstyle result when there is one, otherwise on the selfie. */
export async function applyMakeupLook(effects: MakeupEffect[], baseUrl: string | null, selfieWide: Blob) {
  const src = baseUrl ? (await prepareUpload(await loadImage(baseUrl), 1600)).blob : selfieWide;
  const res = await runYouCam(FEATURES.makeup, { src, params: { effects, version: "1.0" } });
  if (!res.imageUrl) throw new FlowError("generic");
  return res.imageUrl;
}

/**
 * Head and shoulders in a full-body photo. The short-range face detector often misses
 * a face that small, so the pose landmarks (nose, eyes, ears) are the fallback.
 */
async function headBox(canvas: HTMLCanvasElement): Promise<Rect | null> {
  const faces = await detectFaces(canvas);
  if (faces[0]) return faces[0];
  const pose = await detectPose(canvas);
  const pts = (pose?.landmarks.slice(0, 9) ?? []).filter((p) => (p.visibility ?? 1) > 0.3);
  if (pts.length < 3) return null;
  const xs = pts.map((p) => p.x * canvas.width);
  const nose = pose!.landmarks[LM.nose];
  const width = Math.max(...xs) - Math.min(...xs);
  const height = width * 1.3;
  return { x: (Math.max(...xs) + Math.min(...xs)) / 2 - width / 2, y: nose.y * canvas.height - height * 0.55, width, height };
}

/** Head and shoulders with room around them, so the edges fade back to the photo well away from the face. */
function lookCrop(face: Rect, imgW: number, imgH: number): Rect {
  const width = Math.min(imgW, face.width * 3.6);
  const height = Math.min(imgH, width * 1.6);
  const x = Math.max(0, Math.min(imgW - width, face.x + face.width / 2 - width / 2));
  const y = Math.max(0, Math.min(imgH - height, face.y - face.height * 0.9));
  return { x, y, width, height };
}

/** A crop scaled so its long side is exactly `longSide` (enlarging it if needed). */
function cropScaled(canvas: HTMLCanvasElement, r: Rect, longSide: number): HTMLCanvasElement {
  const s = longSide / Math.max(r.width, r.height);
  const out = document.createElement("canvas");
  out.width = Math.round(r.width * s);
  out.height = Math.round(r.height * s);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, out.width, out.height);
  return out;
}

/** Puts the edited head back into the photo: fully replaced in the middle, fading out near the edges. */
function pasteFeathered(target: HTMLCanvasElement, patch: HTMLImageElement, r: Rect, feather = 0.14) {
  const w = Math.round(r.width);
  const h = Math.round(r.height);
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d")!;
  ctx.drawImage(patch, 0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  for (const [x1, y1] of [
    [w, 0],
    [0, h],
  ]) {
    const g = ctx.createLinearGradient(0, 0, x1, y1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(feather, "rgba(0,0,0,1)");
    g.addColorStop(1 - feather, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  target.getContext("2d")!.drawImage(tmp, Math.round(r.x), Math.round(r.y));
}

/**
 * The makeup on the outfit photo: the face in a full-body photo is too small for
 * YouCam's makeup try-on, so the head and shoulders are cropped, enlarged, made up,
 * and pasted back. The haircut stays on the selfie portrait: pasted into a full-body
 * photo it never blended in.
 */
export async function applyLookOnBody(outfitUrl: string, effects: MakeupEffect[]) {
  const img = await loadImage(outfitUrl).catch(() => {
    throw new FlowError("baseExpired");
  });
  const full = toCanvas(img, 2400);
  const head = await headBox(full);
  if (!head) throw new FlowError("no_face_local");
  const rect = lookCrop(head, full.width, full.height);
  const crop = await canvasToBlob(cropScaled(full, rect, 1024));
  const url = await applyMakeupLook(effects, null, crop);
  pasteFeathered(full, await loadImage(url), rect);
  return URL.createObjectURL(await canvasToBlob(full));
}

/** Compares the face before and after the try-on (local, no API cost). */
export async function checkTryOnFidelity(bodyUrl: string, tryOnUrl: string): Promise<FidelityIssue[]> {
  const W = 720;
  const [a, b] = await Promise.all([loadImage(bodyUrl), loadImage(tryOnUrl)]);
  const ca = toCanvas(a, W);
  const cb = toCanvas(b, W);
  // Compare in the same coordinate space: both scaled to the same width.
  const scaleB = ca.width / cb.width;
  const [fa, fb] = await Promise.all([detectFaces(ca), detectFaces(cb)]);
  const original = fa[0] ?? null;
  const result = fb[0]
    ? { x: fb[0].x * scaleB, y: fb[0].y * scaleB, width: fb[0].width * scaleB, height: fb[0].height * scaleB }
    : null;
  let faceDeltaE: number | null = null;
  if (original && fb[0]) {
    const crop = (c: HTMLCanvasElement, r: Rect) => getPixels(toCanvas(c, 48, r)).data;
    const pa = crop(ca, original);
    const pb = crop(cb, fb[0]);
    if (pa.length === pb.length) faceDeltaE = meanDeltaE(pa, pb);
  }
  return fidelityIssues({ original, result, width: ca.width, faceDeltaE });
}

/**
 * "Better version": recolors the isolated garment (YouCam background removal) to a
 * color from the user's palette, then tries that version on with YouCam.
 */
export async function tryOnBetterColor(body: Blob, garment: GarmentAnalysis, targetHex: string) {
  if (!garment.isolatedUrl) throw new FlowError("generic");
  const img = await loadImage(garment.isolatedUrl);
  const canvas = toCanvas(img, 1600);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (recolorPixels(px.data, garment.color.hex, targetHex) === 0) throw new FlowError("generic");
  flattenOnto(px.data);
  ctx.putImageData(px, 0, 0);
  const recolored = await prepareUpload(canvas, 1600);
  const url = await tryOn(body, recolored.blob, garment.attrs.category);
  return { url, garmentUrl: URL.createObjectURL(recolored.blob) };
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
