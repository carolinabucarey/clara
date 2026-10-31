// Color verdict: how the garment's color relates to the measured undertone, depth
// and contrast. Every point added or removed leaves an evidence code behind.

import type { AxisVerdict, ColorProfile, Evidence, GarmentCategory, GarmentColor } from "../types";
import { minConfidence } from "../types";

const round = (n: number) => Math.round(n);

export function verdictFromScore(score: number, flattersMin: number, tweaksMin: number) {
  if (score >= flattersMin) return "flatters" as const;
  if (score >= tweaksMin) return "works_with_tweaks" as const;
  return "not_flattering" as const;
}

export function evaluateColor(profile: ColorProfile, garment: GarmentColor, category: GarmentCategory): AxisVerdict {
  const evidence: Evidence[] = [];
  let score = 0;
  const add = (points: number, code: string, params: Evidence["params"] = {}) => {
    score += points;
    evidence.push({ code, polarity: points > 0 ? "plus" : points < 0 ? "minus" : "neutral", params });
  };
  const base = {
    color: garment.name,
    undertone: profile.undertone,
    skinHue: round(profile.skinHue),
    contrast: profile.contrast,
    deltaL: profile.contrastDeltaL === null ? "?" : round(profile.contrastDeltaL),
    garmentL: round(garment.L),
    garmentC: round(garment.C),
  };

  if (garment.temperature === "achromatic") {
    if (garment.L < 22) {
      if (profile.contrast === "high") add(1.5, "black_high_contrast", base);
      else if (profile.contrast === "low") add(-1.5, "black_low_contrast", base);
      else add(0, "black_medium_contrast", base);
    } else if (garment.L > 92) {
      if (profile.undertone === "warm" && profile.contrast !== "high") add(-1, "stark_white_warm", base);
      else add(1, "white_works", base);
    } else if (profile.undertone === "warm") {
      add(-0.5, "grey_warm", base);
    } else {
      add(0.5, "grey_cool_neutral", base);
    }
  } else {
    // Temperature, weighted by how saturated the garment is.
    const strength = garment.chroma === "bright" ? 1.2 : garment.chroma === "muted" ? 0.6 : 1;
    if (garment.temperature === "balanced") {
      add(1 * strength, "temp_balanced", base);
    } else if (profile.undertone === "neutral") {
      add(1 * strength, "temp_neutral_flexible", { ...base, temperature: garment.temperature });
    } else if (profile.undertone === garment.temperature) {
      add(2 * strength, "temp_match", { ...base, temperature: garment.temperature });
    } else {
      add(-2 * strength, "temp_clash", { ...base, temperature: garment.temperature });
    }

    // Value and chroma against contrast.
    if (profile.contrast === "high") {
      if (garment.value === "dark" || garment.chroma === "bright") add(1, "contrast_carries_intensity", base);
      else if (garment.chroma === "muted" && garment.value === "mid") add(-0.75, "too_soft_for_contrast", base);
    } else if (profile.contrast === "low") {
      if (garment.chroma === "bright" && garment.C > 60) add(-1, "too_bright_for_contrast", base);
      else if (garment.value === "dark" && garment.L < 25) add(-1, "too_dark_for_contrast", base);
      else if (garment.chroma !== "bright") add(0.75, "soft_matches_contrast", base);
    }

    // Very light pastels can wash out deep skin; rich colors echo its depth.
    if (profile.depth === "deep" && garment.chroma !== "muted" && garment.value !== "light") {
      add(0.5, "rich_matches_depth", base);
    }
    if (profile.depth === "light" && garment.value === "dark" && profile.contrast === "low") {
      add(-0.5, "dark_heavy_on_light", base);
    }
  }

  // Bottoms sit far from the face: color matters much less there.
  if (category === "lower_body") {
    score *= 0.4;
    evidence.push({ code: "away_from_face", polarity: "neutral", params: base });
  }

  return {
    verdict: verdictFromScore(score, 1, -0.75),
    score: Math.round(score * 100) / 100,
    confidence: minConfidence(profile.confidence, garment.share < 0.45 ? "medium" : "high"),
    evidence,
  };
}
