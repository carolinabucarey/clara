// Turns the raw colors measured by YouCam into a style color profile:
// undertone, depth and contrast, each with the number that supports it.
//
// YouCam's skin-tone analysis returns hex colors for skin, hair, eyes and lips but
// no undertone, so these classifications are ours. Thresholds are deliberately
// coarse; values near a boundary lower the confidence instead of pretending.

import { hexToLab, isHex, ita, labToLch } from "./lab";
import type { ColorProfile, Confidence, Contrast, Depth, MeasuredColor, Undertone } from "../types";

export interface MeasuredColors {
  skin: string;
  hair?: string | null;
  eye?: string | null;
  lip?: string | null;
}

/** Skin hue angle (degrees) below which skin reads pink/cool, above which golden/warm. */
export const UNDERTONE_COOL_MAX = 50;
export const UNDERTONE_WARM_MIN = 60;
/** ITA° bands for depth. */
export const DEPTH_LIGHT_MIN = 35;
export const DEPTH_DEEP_MAX = 10;
/** Lightness gap (ΔL*) bands for contrast. */
export const CONTRAST_HIGH_MIN = 40;
export const CONTRAST_LOW_MAX = 20;

const BOUNDARY_MARGIN = { hue: 2.5, ita: 3, deltaL: 4 };

export function measure(hex: string): MeasuredColor {
  const lab = hexToLab(hex);
  const lch = labToLch(lab);
  return { hex: hex.toLowerCase(), L: lab.L, a: lab.a, b: lab.b, C: lch.C, h: lch.h };
}

export function classifyUndertone(skinHue: number): Undertone {
  if (skinHue < UNDERTONE_COOL_MAX) return "cool";
  if (skinHue > UNDERTONE_WARM_MIN) return "warm";
  return "neutral";
}

export function classifyDepth(itaDeg: number): Depth {
  if (itaDeg > DEPTH_LIGHT_MIN) return "light";
  if (itaDeg < DEPTH_DEEP_MAX) return "deep";
  return "medium";
}

export function classifyContrast(deltaL: number): Contrast {
  if (deltaL >= CONTRAST_HIGH_MIN) return "high";
  if (deltaL <= CONTRAST_LOW_MAX) return "low";
  return "medium";
}

const near = (value: number, edges: number[], margin: number) => edges.some((e) => Math.abs(value - e) < margin);

export interface ProfileOptions {
  /** YouCam face_quality.lighting or our own check; "poor" lowers confidence. */
  lighting?: "good" | "ok" | "poor";
}

export function buildColorProfile(colors: MeasuredColors, options: ProfileOptions = {}): ColorProfile {
  if (!isHex(colors.skin)) throw new Error("A skin color is required to build a color profile");
  const skin = measure(colors.skin);
  const hair = colors.hair && isHex(colors.hair) ? measure(colors.hair) : undefined;
  const eye = colors.eye && isHex(colors.eye) ? measure(colors.eye) : undefined;
  const lip = colors.lip && isHex(colors.lip) ? measure(colors.lip) : undefined;

  const skinHue = skin.h;
  const itaDeg = ita({ L: skin.L, a: skin.a, b: skin.b });
  const darkest = [hair, eye].filter((c): c is MeasuredColor => !!c).sort((x, y) => x.L - y.L)[0];
  const contrastDeltaL = darkest ? Math.abs(skin.L - darkest.L) : null;

  const issues: string[] = [];
  let confidence: Confidence = "high";
  const lower = (to: Confidence) => {
    if (to === "low" || (to === "medium" && confidence === "high")) confidence = to;
  };

  if (near(skinHue, [UNDERTONE_COOL_MAX, UNDERTONE_WARM_MIN], BOUNDARY_MARGIN.hue)) {
    issues.push("undertone_borderline");
    lower("medium");
  }
  if (near(itaDeg, [DEPTH_LIGHT_MIN, DEPTH_DEEP_MAX], BOUNDARY_MARGIN.ita)) {
    issues.push("depth_borderline");
    lower("medium");
  }
  if (contrastDeltaL === null) {
    issues.push("no_hair_eye_color");
    lower("medium");
  } else if (near(contrastDeltaL, [CONTRAST_HIGH_MIN, CONTRAST_LOW_MAX], BOUNDARY_MARGIN.deltaL)) {
    issues.push("contrast_borderline");
    lower("medium");
  }
  if (skin.C < 8) {
    // Almost grey skin reading usually means a color cast or very flat light.
    issues.push("skin_low_saturation");
    lower("low");
  }
  if (options.lighting === "poor") {
    issues.push("poor_lighting");
    lower("low");
  }

  return {
    undertone: classifyUndertone(skinHue),
    depth: classifyDepth(itaDeg),
    contrast: contrastDeltaL === null ? "medium" : classifyContrast(contrastDeltaL),
    skin,
    hair,
    eye,
    lip,
    skinHue,
    ita: itaDeg,
    contrastDeltaL,
    confidence,
    issues,
  };
}
