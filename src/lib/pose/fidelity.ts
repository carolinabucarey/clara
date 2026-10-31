// Checks whether the virtual try-on changed the person beyond the garment, by
// comparing the face in the original body photo with the face in the result.
// Generated try-on images can drift (face, skin tone); Clara says so instead of
// letting the picture argue for the garment.

import { deltaE, rgbToLab } from "../color/lab";

export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FIDELITY = {
  maxCenterShift: 0.08, // fraction of the image width
  minSizeRatio: 0.8,
  maxSizeRatio: 1.25,
  maxMeanDeltaE: 14,
};

/** Mean CIE76 difference between two same-size RGBA buffers (opaque pixels only). */
export function meanDeltaE(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) throw new Error("buffers must have the same, non-zero size");
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] < 128 || b[i + 3] < 128) continue;
    sum += deltaE(rgbToLab({ r: a[i], g: a[i + 1], b: a[i + 2] }), rgbToLab({ r: b[i], g: b[i + 1], b: b[i + 2] }));
    n++;
  }
  return n ? sum / n : 0;
}

export interface FidelityInput {
  /** Face boxes in pixels of images scaled to the same width `width`. */
  original: FaceRect | null;
  result: FaceRect | null;
  width: number;
  /** Mean ΔE between the two face crops, when both faces were found. */
  faceDeltaE: number | null;
}

export type FidelityIssue = "face_missing" | "face_moved" | "face_resized" | "face_changed";

export function fidelityIssues({ original, result, width, faceDeltaE }: FidelityInput): FidelityIssue[] {
  if (!original) return []; // nothing to compare against
  if (!result) return ["face_missing"];
  const issues: FidelityIssue[] = [];
  const cx = (r: FaceRect) => r.x + r.width / 2;
  const cy = (r: FaceRect) => r.y + r.height / 2;
  const shift = Math.hypot(cx(original) - cx(result), cy(original) - cy(result)) / width;
  if (shift > FIDELITY.maxCenterShift) issues.push("face_moved");
  const ratio = result.width / original.width;
  if (ratio < FIDELITY.minSizeRatio || ratio > FIDELITY.maxSizeRatio) issues.push("face_resized");
  if (faceDeltaE !== null && faceDeltaE > FIDELITY.maxMeanDeltaE) issues.push("face_changed");
  return issues;
}
