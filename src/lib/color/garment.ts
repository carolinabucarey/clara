// Describes a measured garment color in style terms: temperature, value, chroma
// and a basic color name. Pure functions.

import { hexToLab, labToLch } from "./lab";
import type { ColorChroma, ColorTemperature, ColorValue, GarmentColor } from "../types";

export const ACHROMATIC_MAX_CHROMA = 10;

export function colorTemperature(C: number, h: number): ColorTemperature {
  if (C < ACHROMATIC_MAX_CHROMA) return "achromatic";
  // LCh hue landmarks: red ≈ 40°, orange ≈ 60°, yellow ≈ 100°, green ≈ 136°,
  // teal ≈ 196°, blue ≈ 306°, magenta ≈ 328°, pink ≈ 350°.
  if (h >= 42 && h < 115) return "warm";
  if ((h >= 25 && h < 42) || (h >= 115 && h < 155)) return "balanced";
  return "cool";
}

export function colorValue(L: number): ColorValue {
  if (L >= 70) return "light";
  if (L < 35) return "dark";
  return "mid";
}

export function colorChroma(C: number): ColorChroma {
  if (C < 20) return "muted";
  if (C > 50) return "bright";
  return "medium";
}

export function colorName(L: number, C: number, h: number): string {
  if (C < ACHROMATIC_MAX_CHROMA) {
    if (L < 20) return "black";
    if (L > 90) return "white";
    if (L < 45) return "charcoal";
    return "grey";
  }
  const warmish = h >= 40 && h < 105;
  // A muted red hue reads as a brown, not a red: #7b615b (L 44, C 12, h 38) is a greyish brown.
  // Only while it's dark enough: lighter than the pink threshold below it reads as a pale pink,
  // e.g. #efceca (L 85, C 13, h 30).
  const mutedRed = h >= 20 && h < 40 && C < 20 && L <= 72;
  if ((warmish && C < 32) || mutedRed) {
    if (L > 85) return "cream";
    if (L > 68 && C < 24) return "beige";
    if (L > 50) return C < 16 ? "taupe" : "camel";
    return "brown";
  }
  if (h >= 335 || h < 20) {
    if (L < 38) return "burgundy";
    if (L > 68) return "pink";
    return C > 55 && h >= 335 ? "fuchsia" : "red";
  }
  if (h < 45) {
    if (L < 35) return "burgundy";
    if (L > 72) return "pink";
    return L > 58 ? "coral" : "red";
  }
  if (h < 72) {
    if (L < 45) return "rust";
    if (L > 78) return "peach";
    return "orange";
  }
  if (h < 105) {
    if (L < 50) return "olive";
    if (L > 78) return "yellow";
    return "mustard";
  }
  if (h < 160) {
    if (L < 55 && h < 130) return "olive";
    return L > 80 ? "mint" : "green";
  }
  if (h < 225) {
    if (L > 78) return "mint";
    return L < 55 ? "teal" : "turquoise";
  }
  if (h < 310) {
    if (L < 32) return "navy";
    if (L > 70) return "light_blue";
    return "blue";
  }
  if (L < 35) return "plum";
  if (L > 72) return "lilac";
  return C > 60 ? "fuchsia" : "purple";
}

export function describeGarmentColor(hex: string, share = 1): GarmentColor {
  const lch = labToLch(hexToLab(hex));
  return {
    hex: hex.toLowerCase(),
    L: lch.L,
    C: lch.C,
    h: lch.h,
    temperature: colorTemperature(lch.C, lch.h),
    value: colorValue(lch.L),
    chroma: colorChroma(lch.C),
    name: colorName(lch.L, lch.C, lch.h),
    share,
  };
}
