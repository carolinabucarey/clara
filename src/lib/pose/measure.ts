// Body proportions from MediaPipe pose landmarks + the person segmentation mask.
// Pure functions (no MediaPipe import) so they can be unit tested.
//
// Landmarks are joints, not body outlines, so widths come from the mask: we walk
// outwards from the body's center line until the mask ends. Arms touching the
// torso inflate waist and hip widths, which is why we check wrist positions and
// lower the confidence instead of guessing.

import type {
  Balance,
  Confidence,
  HeightClass,
  OverlayLine,
  Proportions,
  RatioRange,
  TorsoLegs,
  WaistShape,
} from "../types";

export interface Landmark {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  z?: number;
  visibility?: number;
}

export interface MaskInput {
  data: ArrayLike<number>; // 0..1 (float) or 0..255 (uint8)
  width: number;
  height: number;
}

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const THRESHOLDS = {
  shouldersWider: 1.1,
  hipsWider: 0.97,
  waistDefined: 0.75,
  waistStraight: 0.85,
  longTorso: 0.68,
  longLegs: 0.57,
  petiteMaxCm: 158,
  tallMinCm: 172,
};

export function classifyHeight(cm: number): HeightClass {
  if (cm < THRESHOLDS.petiteMaxCm) return "petite";
  if (cm > THRESHOLDS.tallMinCm) return "tall";
  return "average";
}

export function classifyBalance(shoulderHip: number): Balance {
  if (shoulderHip > THRESHOLDS.shouldersWider) return "shoulders_wider";
  if (shoulderHip < THRESHOLDS.hipsWider) return "hips_wider";
  return "balanced";
}

export function classifyWaist(waistHip: number): WaistShape {
  if (waistHip < THRESHOLDS.waistDefined) return "defined";
  if (waistHip > THRESHOLDS.waistStraight) return "straight";
  return "moderate";
}

export function classifyTorso(torsoLeg: number): TorsoLegs {
  if (torsoLeg > THRESHOLDS.longTorso) return "long_torso";
  if (torsoLeg < THRESHOLDS.longLegs) return "long_legs";
  return "balanced";
}

/** Width of the mask run that contains `cx` on row `y` (mask pixel units). */
export function rowWidth(mask: MaskInput, y: number, cx: number): { left: number; right: number; width: number } {
  const row = Math.max(0, Math.min(mask.height - 1, Math.round(y)));
  const scale = maxValue(mask) > 1.5 ? 255 : 1;
  const on = (x: number) => mask.data[row * mask.width + x] / scale >= 0.5;
  let x = Math.max(0, Math.min(mask.width - 1, Math.round(cx)));
  if (!on(x)) return { left: x, right: x, width: 0 };
  let left = x;
  while (left > 0 && on(left - 1)) left--;
  let right = x;
  while (right < mask.width - 1 && on(right + 1)) right++;
  x = right - left + 1;
  return { left, right, width: x };
}

const maxCache = new WeakMap<object, number>();
function maxValue(mask: MaskInput): number {
  const key = mask.data as unknown as object;
  const cached = maxCache.get(key);
  if (cached !== undefined) return cached;
  let m = 0;
  for (let i = 0; i < mask.data.length; i += 13) m = Math.max(m, mask.data[i]);
  maxCache.set(key, m);
  return m;
}

const visible = (l: Landmark | undefined, min = 0.5) => !!l && (l.visibility ?? 1) >= min;

export interface MeasureInput {
  landmarks: Landmark[];
  mask: MaskInput;
  heightCm: number;
  /** The user told us the photo has loose clothing. */
  looseClothing?: boolean;
}

export class PoseMeasurementError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function measureBody({ landmarks, mask, heightCm, looseClothing }: MeasureInput): Proportions {
  const lS = landmarks[LM.leftShoulder];
  const rS = landmarks[LM.rightShoulder];
  const lH = landmarks[LM.leftHip];
  const rH = landmarks[LM.rightHip];
  if (!visible(lS) || !visible(rS) || !visible(lH) || !visible(rH)) {
    throw new PoseMeasurementError("pose_not_found");
  }

  const W = mask.width;
  const H = mask.height;
  const px = (l: Landmark) => ({ x: l.x * W, y: l.y * H });
  const ls = px(lS);
  const rs = px(rS);
  const lh = px(lH);
  const rh = px(rH);
  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const torso = hipMid.y - shoulderMid.y;
  if (torso <= 4) throw new PoseMeasurementError("pose_not_found");

  const centerAt = (y: number) => {
    const t = (y - shoulderMid.y) / torso;
    return shoulderMid.x + (hipMid.x - shoulderMid.x) * t;
  };

  // Shoulders: a little below the joint line, where the deltoids are widest.
  const shoulderY = shoulderMid.y + torso * 0.06;
  const shoulder = rowWidth(mask, shoulderY, centerAt(shoulderY));

  // Waist: narrowest row in the middle band of the torso.
  let waist = { left: 0, right: 0, width: Infinity };
  let waistY = shoulderMid.y + torso * 0.6;
  for (let t = 0.4; t <= 0.8; t += 0.02) {
    const y = shoulderMid.y + torso * t;
    const w = rowWidth(mask, y, centerAt(y));
    if (w.width > 0 && w.width < waist.width) {
      waist = w;
      waistY = y;
    }
  }

  // Hips: widest row around and just below the hip joints.
  let hip = { left: 0, right: 0, width: 0 };
  let hipY = hipMid.y;
  for (let t = 0.85; t <= 1.25; t += 0.02) {
    const y = shoulderMid.y + torso * t;
    const w = rowWidth(mask, y, centerAt(y));
    if (w.width > hip.width) {
      hip = w;
      hipY = y;
    }
  }

  if (!shoulder.width || !hip.width || !Number.isFinite(waist.width)) {
    throw new PoseMeasurementError("mask_incomplete");
  }

  const issues: string[] = [];
  let confidence: Confidence = "high";
  const lower = (to: Confidence) => {
    if (to === "low" || (to === "medium" && confidence === "high")) confidence = to;
  };

  // Arms close to the body merge with the torso in the mask.
  const torsoHalf = hip.width / 2;
  for (const idx of [LM.leftWrist, LM.rightWrist]) {
    const w = landmarks[idx];
    if (!visible(w, 0.4)) continue;
    const p = px(w);
    const atTorsoLevel = p.y > shoulderMid.y + torso * 0.3 && p.y < hipMid.y + torso * 0.3;
    if (atTorsoLevel && Math.abs(p.x - centerAt(p.y)) < torsoHalf * 1.15) {
      issues.push("arms_close_to_body");
      lower("medium");
      break;
    }
  }

  // A turned body shows one shoulder much closer to the camera.
  if (lS.z !== undefined && rS.z !== undefined && Math.abs(lS.z - rS.z) > 0.25) {
    issues.push("not_frontal");
    lower("medium");
  }

  let torsoLeg: RatioRange | null = null;
  const lA = landmarks[LM.leftAnkle];
  const rA = landmarks[LM.rightAnkle];
  if (visible(lA) && visible(rA)) {
    const ankleY = ((lA.y + rA.y) / 2) * H;
    const legs = ankleY - hipMid.y;
    if (legs > torso * 0.8) {
      const v = torso / legs;
      torsoLeg = { value: v, low: v - 0.03, high: v + 0.03 };
    }
  }
  if (!torsoLeg) {
    issues.push("ankles_not_visible");
    lower("medium");
  }

  const spread = looseClothing ? 0.08 : 0.04;
  if (looseClothing) {
    issues.push("loose_clothing");
    lower("medium");
  }
  if (issues.includes("arms_close_to_body") && looseClothing) lower("low");

  const shoulderHipV = shoulder.width / hip.width;
  const waistHipV = waist.width / hip.width;
  const range = (v: number, s: number): RatioRange => ({ value: v, low: v - s, high: v + s });

  const line = (y: number, w: { left: number; right: number }): OverlayLine => ({
    y: y / H,
    x1: w.left / W,
    x2: (w.right + 1) / W,
  });

  return {
    balance: classifyBalance(shoulderHipV),
    waist: classifyWaist(waistHipV),
    torso: torsoLeg ? classifyTorso(torsoLeg.value) : "balanced",
    height: classifyHeight(heightCm),
    heightCm,
    shoulderHip: range(shoulderHipV, spread),
    waistHip: range(waistHipV, spread),
    torsoLeg,
    confidence,
    issues,
    lines: {
      shoulder: line(shoulderY, shoulder),
      waist: line(waistY, waist),
      hip: line(hipY, hip),
    },
  };
}
