// Assembles the full verdict: color + cut + rescues + palette. Deterministic.

import { evaluateColor } from "./color";
import { evaluateCut } from "./cut";
import { closestPaletteColor, lipstickFor, paletteFor } from "./palette";
import type {
  ColorProfile,
  GarmentAttributes,
  GarmentColor,
  Goal,
  Proportions,
  Rescue,
  VerdictResult,
} from "../types";

export interface VerdictInput {
  profile: ColorProfile;
  proportions: Proportions;
  garment: GarmentAttributes;
  garmentColor: GarmentColor;
  goals?: Goal[];
}

export function buildVerdict({ profile, proportions, garment, garmentColor, goals = [] }: VerdictInput): VerdictResult {
  const color = evaluateColor(profile, garmentColor, garment.category);
  const { rescueKinds, ...cut } = evaluateCut(proportions, garment, goals);
  const palette = paletteFor(profile);
  const rescues: Rescue[] = [];

  if (color.verdict !== "flatters") {
    const lip = lipstickFor(profile);
    rescues.push({ kind: "lipstick", code: "lipstick", lipstick: lip, params: { undertone: profile.undertone } });
    if (garment.category !== "lower_body") {
      rescues.push({ kind: "color_near_face", code: "color_near_face", swatches: palette.slice(0, 4) });
    }
    rescues.push({
      kind: "metal",
      code: profile.undertone === "warm" ? "metal_gold" : profile.undertone === "cool" ? "metal_silver" : "metal_both",
    });
  }
  const seen = new Set<string>();
  for (const r of rescueKinds) {
    if (seen.has(r.kind)) continue;
    seen.add(r.kind);
    rescues.push({ kind: r.kind, code: `cut_${r.kind}`, params: { from: r.from } });
  }

  return {
    color,
    cut,
    rescues,
    palette,
    betterColor: color.verdict === "flatters" ? null : closestPaletteColor(palette, garmentColor.hex),
  };
}
