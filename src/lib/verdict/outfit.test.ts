import { describe, expect, it } from "vitest";
import { describeGarmentColor } from "../color/garment";
import { DEFAULT_ATTRIBUTES } from "../garment/read";
import { evaluateOutfit, suggestComplement, type OutfitPiece } from "./outfit";
import type { GarmentAttributes, Proportions } from "../types";

const proportions = (over: Partial<Proportions> = {}): Proportions => ({
  balance: "balanced",
  waist: "moderate",
  torso: "balanced",
  height: "average",
  heightCm: 165,
  shoulderHip: { value: 1.02, low: 0.98, high: 1.06 },
  waistHip: { value: 0.8, low: 0.76, high: 0.84 },
  torsoLeg: { value: 0.62, low: 0.59, high: 0.65 },
  confidence: "high",
  issues: [],
  lines: { shoulder: { y: 0.2, x1: 0.3, x2: 0.7 }, waist: { y: 0.35, x1: 0.35, x2: 0.65 }, hip: { y: 0.48, x1: 0.3, x2: 0.7 } },
  ...over,
});

const piece = (hex: string, over: Partial<GarmentAttributes> = {}): OutfitPiece => ({
  attrs: { ...DEFAULT_ATTRIBUTES, confidence: "high", uncertain: [], ...over },
  color: describeGarmentColor(hex),
});

const top = (hex: string, over: Partial<GarmentAttributes> = {}) => piece(hex, { category: "upper_body", ...over });
const bottom = (hex: string, over: Partial<GarmentAttributes> = {}) =>
  piece(hex, { category: "lower_body", neckline: "none", sleeves: "none", rise: "mid", leg: "straight", ...over });
const codes = (r: ReturnType<typeof evaluateOutfit>) => r?.evidence.map((e) => e.code) ?? [];

describe("outfit verdict", () => {
  it("needs both halves", () => {
    expect(evaluateOutfit({ top: top("#1f2a44") }, proportions())).toBeNull();
  });

  it("a tonal column elongates a petite frame", () => {
    const r = evaluateOutfit({ top: top("#1f2a44"), bottom: bottom("#24304c") }, proportions({ height: "petite", heightCm: 155 }));
    expect(codes(r)).toContain("tonal_column_elongates");
    expect(r?.verdict).toBe("works_together");
  });

  it("a strong light/dark break shortens the line when looking taller is the goal", () => {
    const r = evaluateOutfit({ top: top("#f4f4f4"), bottom: bottom("#151515") }, proportions(), ["elongate"]);
    expect(codes(r)).toContain("contrast_break_shortens");
    expect(r?.tweaks).toContain("outfit_shoes");
  });

  it("a lighter top over a darker bottom balances wider hips", () => {
    const r = evaluateOutfit({ top: top("#e9dcc4"), bottom: bottom("#3b2f2a") }, proportions({ balance: "hips_wider" }));
    expect(codes(r)).toContain("light_top_dark_bottom_balances");
  });

  it("two roomy halves ask for a tuck", () => {
    const r = evaluateOutfit(
      { top: top("#e9dcc4", { fit: "oversized", waist: "undefined" }), bottom: bottom("#3b2f2a", { leg: "wide", fit: "relaxed" }) },
      proportions(),
    );
    expect(codes(r)).toContain("volume_both");
    expect(r?.tweaks).toContain("outfit_tuck");
  });

  it("a fitted top balances a wide leg", () => {
    const r = evaluateOutfit({ top: top("#ffffff", { fit: "fitted" }), bottom: bottom("#1f2a44", { leg: "wide" }) }, proportions());
    expect(codes(r)).toContain("fitted_top_full_bottom");
  });

  it("two prints compete; two clear unrelated colors compete", () => {
    const prints = evaluateOutfit({ top: top("#c2185b", { pattern: "print" }), bottom: bottom("#1f2a44", { pattern: "stripes_vertical" }) }, proportions());
    expect(codes(prints)).toContain("two_patterns_compete");
    const clash = evaluateOutfit({ top: top("#d64545"), bottom: bottom("#3a8f3a") }, proportions());
    expect(codes(clash)).toContain("colors_compete");
  });

  it("a long top over a high rise is better tucked", () => {
    const r = evaluateOutfit({ top: top("#ffffff", { length: "tunic" }), bottom: bottom("#1f2a44", { rise: "high" }) }, proportions());
    expect(codes(r)).toContain("long_top_covers_rise");
  });

  it("a layer over a dress counts as the upper half", () => {
    const r = evaluateOutfit(
      { full: piece("#1f2a44", { category: "full_body", fit: "a_line" }), outer: piece("#efe1c6", { category: "outer", fit: "oversized" }) },
      proportions(),
    );
    expect(r).not.toBeNull();
    expect(codes(r)).toContain("volume_both");
    expect(r?.tweaks).toContain("outfit_belt");
  });
});

describe("complement suggestion", () => {
  const profile = { undertone: "warm" as const, contrast: "medium" as const };

  it("suggests a bottom for a lone top, darker for wider hips", () => {
    const s = suggestComplement(profile, proportions({ balance: "hips_wider", torso: "long_torso" }), [], { top: top("#efe1c6") });
    expect(s?.slot).toBe("bottom");
    expect(s?.tips).toContain("bottom_high_rise");
    expect(s?.tips).toContain("bottom_straight_dark");
    expect(s?.colors.length).toBeGreaterThan(0);
    expect(s!.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
  });

  it("suggests a top for a lone bottom and nothing once the look is complete", () => {
    expect(suggestComplement(profile, proportions(), [], { bottom: bottom("#1f2a44", { leg: "wide" }) })?.tips).toContain("top_fitted");
    expect(suggestComplement(profile, proportions(), [], { top: top("#ffffff"), bottom: bottom("#000000") })).toBeNull();
    expect(suggestComplement(profile, proportions(), [], { full: piece("#1f2a44", { category: "full_body" }) })).toBeNull();
  });
});
