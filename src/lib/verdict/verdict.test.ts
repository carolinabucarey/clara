import { describe, expect, it } from "vitest";
import { buildColorProfile } from "../color/profile";
import { describeGarmentColor } from "../color/garment";
import { evaluateColor } from "./color";
import { evaluateCut } from "./cut";
import { buildVerdict } from "./index";
import { templateDraft, violations } from "./draft";
import { DEFAULT_ATTRIBUTES } from "../garment/read";
import { evidenceText, rescueText } from "../i18n";
import { en } from "../i18n/en";
import type { ColorProfile, GarmentAttributes, Proportions } from "../types";

const profile = (over: Partial<ColorProfile>): ColorProfile => ({
  ...buildColorProfile({ skin: "#d9a98a", hair: "#3b2a20", eye: "#4a3426" }),
  ...over,
});

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

const garment = (over: Partial<GarmentAttributes> = {}): GarmentAttributes => ({
  ...DEFAULT_ATTRIBUTES,
  confidence: "high",
  uncertain: [],
  ...over,
});

describe("color verdict", () => {
  it("favors warm colors on warm undertones and flags cool ones", () => {
    const warm = profile({ undertone: "warm", contrast: "medium" });
    expect(evaluateColor(warm, describeGarmentColor("#c1834a"), "upper_body").verdict).toBe("flatters");
    const clash = evaluateColor(warm, describeGarmentColor("#c2185b"), "upper_body");
    expect(clash.verdict).not.toBe("flatters");
    expect(clash.evidence.map((e) => e.code)).toContain("temp_clash");
  });

  it("treats black by contrast level", () => {
    const black = describeGarmentColor("#0d0d0d");
    expect(evaluateColor(profile({ contrast: "high" }), black, "upper_body").verdict).toBe("flatters");
    const low = evaluateColor(profile({ contrast: "low", contrastDeltaL: 15 }), black, "upper_body");
    expect(low.verdict).toBe("not_flattering");
    expect(low.evidence[0].params?.deltaL).toBe(15);
  });

  it("softens the color verdict for bottoms", () => {
    const warm = profile({ undertone: "warm" });
    const bottom = evaluateColor(warm, describeGarmentColor("#c2185b"), "lower_body");
    expect(bottom.verdict).toBe("works_with_tweaks");
    expect(bottom.evidence.map((e) => e.code)).toContain("away_from_face");
  });
});

describe("cut verdict", () => {
  it("rewards a wide neckline when hips are wider", () => {
    const v = evaluateCut(proportions({ balance: "hips_wider" }), garment({ neckline: "boat" }));
    expect(v.evidence.map((e) => e.code)).toContain("wide_neckline_balances");
    expect(v.verdict).toBe("flatters");
  });

  it("flags a boxy top on a defined waist and proposes a tuck", () => {
    const v = evaluateCut(proportions({ waist: "defined" }), garment({ fit: "oversized", waist: "undefined" }));
    expect(v.evidence.map((e) => e.code)).toContain("boxy_skips_waist");
    expect(v.rescueKinds.map((r) => r.kind)).toContain("tuck");
    expect(v.verdict).not.toBe("flatters");
  });

  it("flags midi on petite frames with a shoes rescue", () => {
    const v = evaluateCut(
      proportions({ height: "petite", heightCm: 152 }),
      garment({ category: "full_body", length: "midi", fit: "straight" }),
    );
    expect(v.evidence.find((e) => e.code === "midi_cuts_petite")?.params?.heightCm).toBe(152);
    expect(v.rescueKinds.map((r) => r.kind)).toContain("shoes");
  });

  it("weights rules by the user's goals", () => {
    const p = proportions({ waist: "defined" });
    const g = garment({ fit: "wrap" });
    expect(evaluateCut(p, g, ["show_waist"]).score).toBeGreaterThan(evaluateCut(p, g).score);
  });
});

describe("full verdict", () => {
  it("adds lipstick and palette rescues when the color does not flatter", () => {
    const warm = profile({ undertone: "warm", depth: "medium" });
    const r = buildVerdict({
      profile: warm,
      proportions: proportions(),
      garment: garment(),
      garmentColor: describeGarmentColor("#c2185b"),
    });
    const lip = r.rescues.find((x) => x.kind === "lipstick");
    expect(lip?.lipstick?.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(r.betterColor).not.toBeNull();
  });

  it("renders a template draft in both languages", () => {
    const r = buildVerdict({
      profile: profile({ undertone: "cool" }),
      proportions: proportions({ balance: "hips_wider" }),
      garment: garment({ neckline: "boat" }),
      garmentColor: describeGarmentColor("#e2725b"),
    });
    for (const locale of ["en", "es"] as const) {
      const d = templateDraft(locale, r);
      expect(d.cut.body).not.toMatch(/\{\w+\}/);
      expect(d.color.body).not.toMatch(/\{\w+\}/);
      expect(violations(locale, d)).toEqual([]);
    }
  });
});

describe("language validator", () => {
  const base = {
    cut: { headline: "Works with tweaks", body: "It marks your waist." },
    color: { headline: "Flatters you", body: "Echoes your warm undertone." },
    rescue: null,
    uncertainty: null,
  };
  it("accepts goal-oriented language", () => {
    expect(violations("en", base)).toEqual([]);
  });
  it("rejects defect language and fruit labels", () => {
    expect(violations("en", { ...base, cut: { headline: "x", body: "It will hide your hips, great for a pear shape." } })).not.toEqual([]);
    expect(violations("es", { ...base, cut: { headline: "x", body: "Ayuda a disimular la cadera." } })).not.toEqual([]);
  });
});

describe("i18n coverage", () => {
  it("has evidence and rescue text for every code, in both languages, without leftover params", () => {
    const params = { color: "blue", undertone: "warm", temperature: "cool", contrast: "low", skinHue: 55, deltaL: 30, garmentL: 40, garmentC: 50, shoulderHip: "1.00", waistHip: "0.80", torsoLeg: "0.62", heightCm: 160, name: "coral" };
    for (const locale of ["en", "es"] as const) {
      for (const code of Object.keys(en.evidence)) expect(evidenceText(locale, code, params)).not.toMatch(/\{\w+\}|^evidence\./);
      for (const code of Object.keys(en.rescues)) expect(rescueText(locale, code, params)).not.toMatch(/\{\w+\}|^rescues\./);
    }
  });
});
