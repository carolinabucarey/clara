// Outfit verdict: how the pieces of a look work together (color between pieces,
// volume, lengths), plus what to look for when the look is missing its other
// half. Deterministic, and phrased in goals like the cut rules.

import { hexToLch, hueDistance } from "../color/lab";
import { paletteFor } from "./palette";
import { minConfidence } from "../types";
import type {
  ColorProfile,
  ComplementSuggestion,
  Evidence,
  GarmentAttributes,
  GarmentColor,
  Goal,
  OutfitResult,
  Proportions,
  Slot,
} from "../types";

export interface OutfitPiece {
  attrs: GarmentAttributes;
  color: Pick<GarmentColor, "hex" | "L" | "C" | "h" | "temperature" | "chroma" | "name">;
}

export type OutfitPieces = Partial<Record<Slot, OutfitPiece>>;

type Tone = { L: number; C: number; h: number };

const isNeutral = (c: Tone) => c.C < 12;
/** Same color family and close in value: reads as one long column. */
const isTonal = (a: Tone, b: Tone) =>
  isNeutral(a) && isNeutral(b) ? Math.abs(a.L - b.L) < 18 : !isNeutral(a) && !isNeutral(b) && hueDistance(a.h, b.h) < 25 && Math.abs(a.L - b.L) < 25;
/** Two clear colors that are neither tonal nor opposite: they pull the eye in two directions. */
const competes = (a: Tone, b: Tone) => {
  if (isNeutral(a) || isNeutral(b) || a.C < 25 || b.C < 25) return false;
  const d = hueDistance(a.h, b.h);
  return d >= 35 && d < 150;
};

const VOLUME_FITS = ["oversized", "relaxed"];
const isVolumeUp = (g: GarmentAttributes) => VOLUME_FITS.includes(g.fit) && g.waist !== "belted";
const isFittedUp = (g: GarmentAttributes) => ["fitted", "bodycon", "wrap"].includes(g.fit) || g.waist === "belted";
const isVolumeDown = (g: GarmentAttributes) =>
  ["wide", "flare", "bootcut"].includes(g.leg) || ["a_line", "flared", "oversized", "relaxed"].includes(g.fit);
const isSlimDown = (g: GarmentAttributes) => ["skinny", "straight"].includes(g.leg) || ["fitted", "bodycon"].includes(g.fit);

/** The upper and lower halves of the look: top or layer over a bottom or a dress. */
function halves(pieces: OutfitPieces) {
  const upper = pieces.top ?? pieces.outer;
  const lower = pieces.bottom ?? pieces.full;
  return upper && lower ? { upper, lower } : null;
}

export function evaluateOutfit(pieces: OutfitPieces, proportions: Proportions, goals: Goal[] = []): OutfitResult | null {
  const pair = halves(pieces);
  if (!pair) return null;
  const { upper, lower } = pair;
  const u = upper.color;
  const l = lower.color;
  const evidence: Evidence[] = [];
  const tweaks: string[] = [];
  let score = 0;
  const params = {
    topColor: u.name,
    bottomColor: l.name,
    gap: Math.round(Math.abs(u.L - l.L)),
    heightCm: proportions.heightCm,
    shoulderHip: proportions.shoulderHip.value.toFixed(2),
  };
  const add = (points: number, code: string, tweak?: string) => {
    score += points;
    evidence.push({ code, polarity: points > 0 ? "plus" : points < 0 ? "minus" : "neutral", params });
    if (points < 0 && tweak && !tweaks.includes(tweak)) tweaks.push(tweak);
  };
  const wantsLength = proportions.height === "petite" || goals.includes("elongate");
  const gap = u.L - l.L;

  // Color between the pieces.
  if (isTonal(u, l)) {
    add(wantsLength ? 1.75 : 1, wantsLength ? "tonal_column_elongates" : "tonal_column");
  } else if (Math.abs(gap) >= 40) {
    if (wantsLength) add(-0.75, "contrast_break_shortens", "outfit_shoes");
    else if (proportions.waist === "defined" || goals.includes("show_waist")) add(0.5, "contrast_marks_waist");
    else add(0, "contrast_break");
  }
  if (!isTonal(u, l)) {
    if (gap >= 20 && proportions.balance === "hips_wider") add(1, "light_top_dark_bottom_balances");
    else if (gap >= 20 && proportions.balance === "shoulders_wider") add(-0.5, "light_top_adds_width", "outfit_swap_values");
    else if (gap <= -20 && proportions.balance === "shoulders_wider") add(1, "dark_top_light_bottom_balances");
    else if (gap <= -20 && proportions.balance === "hips_wider") add(-0.5, "light_bottom_draws_hips", "outfit_swap_values");

    if (isNeutral(u) !== isNeutral(l)) add(0.5, "neutral_anchors");
    else if (competes(u, l)) add(-0.5, "colors_compete", "outfit_neutral");
    else if (!isNeutral(u) && !isNeutral(l) && hueDistance(u.h, l.h) >= 150) add(0.25, "bold_complements");
  }

  // Patterns.
  const patterned = [upper, lower].filter((p) => p.attrs.pattern !== "solid").length;
  if (patterned === 2) add(-1, "two_patterns_compete", "outfit_one_pattern");
  else if (patterned === 1) add(0.5, "one_pattern_leads");

  // Volume: one roomy half balances one close half.
  const layer = pieces.top && pieces.outer ? pieces.outer.attrs : null;
  const upVolume = isVolumeUp(upper.attrs) || (layer !== null && isVolumeUp(layer));
  const upFitted = isFittedUp(upper.attrs) && !upVolume;
  if (upVolume && isVolumeDown(lower.attrs)) add(-1, "volume_both", pieces.top ? "outfit_tuck" : "outfit_belt");
  else if (upFitted && isVolumeDown(lower.attrs)) add(1, "fitted_top_full_bottom");
  else if (upVolume && isSlimDown(lower.attrs)) add(1, "full_top_slim_bottom");
  else if (upFitted && isSlimDown(lower.attrs)) add(0.5, "streamlined");

  // Where the top ends against the rise of the bottom.
  if (pieces.top && pieces.bottom && pieces.bottom.attrs.rise === "high") {
    const len = pieces.top.attrs.length;
    if (len === "tunic" || len === "hip") add(-0.5, "long_top_covers_rise", "outfit_tuck");
    else if (len === "cropped" || len === "waist") add(0.75, "short_top_high_rise");
  }

  if (evidence.length === 0) evidence.push({ code: "outfit_no_strong_effect", polarity: "neutral", params });
  return {
    verdict: score >= 1 ? "works_together" : score >= -0.75 ? "works_with_tweaks" : "clash",
    score: Math.round(score * 100) / 100,
    confidence: minConfidence(upper.attrs.confidence, lower.attrs.confidence, proportions.confidence),
    evidence,
    tweaks,
  };
}

const ANCHORS: Record<ColorProfile["undertone"], string[]> = {
  warm: ["#3b2f2a", "#efe1c6", "#8a6f55"],
  cool: ["#1f2a44", "#f4f6fb", "#6b7280"],
  neutral: ["#2b2b2f", "#f1ede8", "#857f78"],
};

/** Colors and cut tips for the missing half, when the look has only a top or only a bottom. */
export function suggestComplement(
  profile: Pick<ColorProfile, "undertone" | "contrast">,
  proportions: Proportions,
  goals: Goal[],
  pieces: OutfitPieces,
): ComplementSuggestion | null {
  if (pieces.full) return null;
  const have = pieces.top ?? pieces.outer ?? pieces.bottom;
  if (!have || ((pieces.top || pieces.outer) && pieces.bottom)) return null;
  const slot: Slot = pieces.bottom ? "top" : "bottom";
  const p = have.color;
  const palette = paletteFor(profile);
  const wantsLength = proportions.height === "petite" || goals.includes("elongate");

  const scored = [...new Set([...palette, ...ANCHORS[profile.undertone]])].map((hex) => {
    const c = hexToLch(hex);
    let s = 0;
    if (isNeutral(c) && !isNeutral(p)) s += 1;
    if (isTonal(c, p)) s += wantsLength ? 1.5 : 0.5;
    if (competes(c, p)) s -= 2;
    if (slot === "bottom") {
      if (proportions.balance === "hips_wider" && c.L < p.L - 15) s += 1;
      if (proportions.balance === "shoulders_wider" && c.L > p.L + 10) s += 0.5;
    } else if (palette.includes(hex)) {
      s += 1; // a top sits next to the face: the personal palette matters most
    }
    return { hex, s };
  });
  const colors = scored
    .filter((x) => x.s > -1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)
    .map((x) => x.hex);

  const tips: string[] = [];
  const g = have.attrs;
  if (slot === "bottom") {
    if (proportions.torso === "long_torso" || proportions.waist === "defined") tips.push("bottom_high_rise");
    if (proportions.torso === "long_legs") tips.push("bottom_mid_rise");
    if (proportions.height === "petite") tips.push("bottom_hem_petite");
    if (proportions.balance === "hips_wider") tips.push("bottom_straight_dark");
    if (proportions.balance === "shoulders_wider") tips.push("bottom_volume");
    if (isVolumeUp(g)) tips.push("bottom_slim");
    else if (isFittedUp(g)) tips.push("bottom_volume_ok");
  } else {
    if (proportions.torso === "long_torso") tips.push("top_short_or_tucked");
    if (proportions.torso === "long_legs") tips.push("top_hip_length");
    if (proportions.balance === "shoulders_wider") tips.push("top_v_neck");
    if (proportions.balance === "hips_wider") tips.push("top_wide_neck");
    if (proportions.waist === "defined") tips.push("top_marks_waist");
    if (isVolumeDown(g)) tips.push("top_fitted");
    else if (isSlimDown(g)) tips.push("top_relaxed_ok");
  }
  if (tips.length === 0) tips.push(slot === "bottom" ? "bottom_any" : "top_any");
  return { slot, colors, tips: [...new Set(tips)].slice(0, 3) };
}
