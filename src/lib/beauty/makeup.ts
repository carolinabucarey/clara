// Suggested makeup: shades from the measured undertone, depth and contrast, placement
// from the face shape, and a nod to the outfit's color. Pure, so it is tested and can
// be explained step by step ("your undertone is warm (63°), so a peach blush").
// Each step can swap Clara's shade for another one the person wants to try.

import { hexToLch } from "../color/lab";
import { describeGarmentColor } from "../color/garment";
import { lipsticksFor, ownFirst } from "../verdict/palette";
import type { MakeupEffect } from "../youcam/features";
import type { ColorProfile, Contrast, Depth, FaceShape, MakeupCategory, MakeupStep, Undertone } from "../types";

const BLUSH: Record<Undertone, Record<Depth, { hex: string; name: string }>> = {
  warm: { light: { hex: "#f0a080", name: "peach" }, medium: { hex: "#d9785a", name: "apricot" }, deep: { hex: "#b4553a", name: "terracotta" } },
  cool: { light: { hex: "#f2a0b5", name: "soft_pink" }, medium: { hex: "#d0607e", name: "rose" }, deep: { hex: "#a8385e", name: "berry" } },
  neutral: { light: { hex: "#eaa0a0", name: "dusty_rose" }, medium: { hex: "#cf6f6f", name: "rosewood" }, deep: { hex: "#a84848", name: "brick_rose" } },
};

/** Lid color and a deeper crease color, Soft/Natural two-color layout. */
const SHADOW: Record<Undertone, { colors: [string, string]; name: string }> = {
  warm: { colors: ["#d8b48f", "#8a5a3c"], name: "bronze" },
  cool: { colors: ["#c9b3c4", "#6e5a7e"], name: "mauve" },
  neutral: { colors: ["#cdb5a5", "#7a6355"], name: "taupe" },
};

const LINER: Record<Contrast, { hex: string; name: string; intensity: number }> = {
  high: { hex: "#1a1a1a", name: "black", intensity: 70 },
  medium: { hex: "#3b2a20", name: "dark_brown", intensity: 55 },
  low: { hex: "#5a4030", name: "soft_brown", intensity: 40 },
};

/** Eye shades outside any undertone, only offered to try. */
const EXTRA_SHADOWS: Array<{ colors: [string, string]; name: string }> = [
  { colors: ["#b0aeb0", "#3c3a3e"], name: "smoky" },
  { colors: ["#bf98ac", "#5e3050"], name: "plum" },
  { colors: ["#bab27f", "#5b5a2e"], name: "olive" },
];
const EXTRA_LINERS: Array<{ hex: string; name: string }> = [
  { hex: "#1f2a4a", name: "navy" },
  { hex: "#4a2440", name: "plum" },
];

/** Blush placement from YouCam's catalog (patterns tagged by face shape). */
const BLUSH_PATTERN: Partial<Record<FaceShape, string>> = {
  round: "1color2",
  oblong: "1color1",
  square: "1color3",
  heart: "1color8",
  inv_triangle: "1color8",
};
const DEFAULT_BLUSH_PATTERN = "1color4";
const SHADOW_PATTERN = "2colors1";
const LINER_PATTERN = "Upper6";

const BY_CONTRAST: Record<Contrast, number> = { low: 0, medium: 1, high: 2 };
const UNDERTONES: Undertone[] = ["warm", "cool", "neutral"];
const CONTRASTS: Contrast[] = ["high", "medium", "low"];

/** A shade to pick for one makeup step; `name` is an i18n key under `shades` (`lipsticks` for lips). */
export interface MakeupShade {
  name: string;
  colors: string[];
}

/** The shade the person picked per step; a missing step keeps Clara's. */
export type MakeupShades = Partial<Record<MakeupCategory, string>>;

/** Shades to pick from for each step: Clara's for this coloring first, then others to try. */
export function makeupShades(profile: ColorProfile): Record<MakeupCategory, MakeupShade[]> {
  const shadows = [profile.undertone, ...UNDERTONES.filter((u) => u !== profile.undertone)].map((u) => SHADOW[u]);
  const liners = [profile.contrast, ...CONTRASTS.filter((c) => c !== profile.contrast)].map((c) => LINER[c]);
  return {
    blush: ownFirst(BLUSH, profile).map((s) => ({ name: s.name, colors: [s.hex] })),
    eye_shadow: [...shadows, ...EXTRA_SHADOWS].map((s) => ({ name: s.name, colors: s.colors })),
    eye_liner: [...liners, ...EXTRA_LINERS].map((s) => ({ name: s.name, colors: [s.hex] })),
    lip_color: lipsticksFor(profile).map((s) => ({ name: s.name, colors: [s.hex] })),
  };
}

/** The shade a step was made with. */
export const shadeOf = (step: MakeupStep) => String(step.params?.shade ?? step.params?.name ?? "");

export function makeupFor(profile: ColorProfile, faceShape: FaceShape | null, outfitHexes: string[] = [], chosen: MakeupShades = {}): MakeupStep[] {
  const level = BY_CONTRAST[profile.contrast];
  const base = { undertone: profile.undertone, skinHue: Math.round(profile.skinHue), contrast: profile.contrast };
  const deltaL = profile.contrastDeltaL === null ? "?" : Math.round(profile.contrastDeltaL);

  // Clara's shade unless the person picked another one to try.
  const shades = makeupShades(profile);
  const pick = (c: MakeupCategory) => {
    const shade = shades[c].find((s) => s.name === chosen[c]) ?? shades[c][0];
    return { ...shade, tried: shade !== shades[c][0] };
  };

  const blush = pick("blush");
  const shaped = !!faceShape && !!BLUSH_PATTERN[faceShape];
  const blushPattern = (faceShape && BLUSH_PATTERN[faceShape]) || DEFAULT_BLUSH_PATTERN;

  // The outfit's main chromatic color stays the star; with neutral clothes the eyes can carry more depth.
  const main = outfitHexes.map((h) => ({ hex: h, ...hexToLch(h) })).find((c) => c.C >= 15);
  const shadow = pick("eye_shadow");
  const shadowIntensity = 30 + level * 10 + (main ? 0 : 10);

  const liner = pick("eye_liner");
  const lip = pick("lip_color");

  return [
    {
      category: "blush",
      colors: blush.colors,
      intensity: 35 + level * 10,
      pattern: blushPattern,
      code: `${shaped ? "blush_shape" : "blush"}${blush.tried ? "_try" : ""}`,
      params: { ...base, shade: blush.name, ...(faceShape ? { shape: faceShape } : {}) },
    },
    {
      category: "eye_shadow",
      colors: shadow.colors,
      intensity: shadowIntensity,
      pattern: SHADOW_PATTERN,
      code: shadow.tried ? "eyes_try" : main ? "eyes_let_color_lead" : "eyes_depth_with_neutrals",
      params: { ...base, shade: shadow.name, ...(main ? { color: describeGarmentColor(main.hex).name } : {}) },
    },
    {
      category: "eye_liner",
      colors: liner.colors,
      intensity: LINER[profile.contrast].intensity,
      pattern: LINER_PATTERN,
      code: liner.tried ? "liner_try" : `liner_${profile.contrast}`,
      params: { ...base, shade: liner.name, deltaL },
    },
    {
      category: "lip_color",
      colors: lip.colors,
      intensity: 55 + level * 12,
      code: lip.tried ? "lip_try" : "lip",
      params: { ...base, name: lip.name },
    },
  ];
}

/** YouCam makeup-vto effects for the steps the person kept. */
export function makeupEffects(steps: MakeupStep[]): MakeupEffect[] {
  return steps.map((s): MakeupEffect => {
    switch (s.category) {
      case "lip_color":
        return {
          category: "lip_color",
          shape: { name: "original" },
          style: { type: "full" },
          palettes: [{ color: s.colors[0], texture: "satin", colorIntensity: s.intensity }],
        };
      case "blush":
        return {
          category: "blush",
          pattern: { name: s.pattern ?? DEFAULT_BLUSH_PATTERN },
          palettes: [{ color: s.colors[0], texture: "matte", colorIntensity: s.intensity }],
        };
      case "eye_shadow":
        return {
          category: "eye_shadow",
          pattern: { name: s.pattern ?? SHADOW_PATTERN },
          palettes: s.colors.map((color) => ({ color, texture: "matte" as const, colorIntensity: s.intensity })),
        };
      case "eye_liner":
        return {
          category: "eye_liner",
          pattern: { name: s.pattern ?? LINER_PATTERN },
          palettes: [{ color: s.colors[0], texture: "matte", colorIntensity: s.intensity }],
        };
    }
  });
}
