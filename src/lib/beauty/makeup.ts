// Suggested makeup: shades from the measured undertone, depth and contrast, placement
// from the face shape, and a nod to the outfit's color. Pure, so it is tested and can
// be explained step by step ("your undertone is warm (63°), so a peach blush").

import { hexToLch } from "../color/lab";
import { describeGarmentColor } from "../color/garment";
import { lipstickFor } from "../verdict/palette";
import type { MakeupEffect } from "../youcam/features";
import type { ColorProfile, Contrast, Depth, FaceShape, MakeupStep, Undertone } from "../types";

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

export function makeupFor(profile: ColorProfile, faceShape: FaceShape | null, outfitHexes: string[] = []): MakeupStep[] {
  const level = BY_CONTRAST[profile.contrast];
  const base = { undertone: profile.undertone, skinHue: Math.round(profile.skinHue), contrast: profile.contrast };
  const deltaL = profile.contrastDeltaL === null ? "?" : Math.round(profile.contrastDeltaL);

  const blush = BLUSH[profile.undertone][profile.depth];
  const blushPattern = (faceShape && BLUSH_PATTERN[faceShape]) || DEFAULT_BLUSH_PATTERN;

  // The outfit's main chromatic color stays the star; with neutral clothes the eyes can carry more depth.
  const main = outfitHexes.map((h) => ({ hex: h, ...hexToLch(h) })).find((c) => c.C >= 15);
  const shadow = SHADOW[profile.undertone];
  const shadowIntensity = 30 + level * 10 + (main ? 0 : 10);

  const liner = LINER[profile.contrast];
  const lip = lipstickFor(profile);

  return [
    {
      category: "blush",
      colors: [blush.hex],
      intensity: 35 + level * 10,
      pattern: blushPattern,
      code: faceShape && BLUSH_PATTERN[faceShape] ? "blush_shape" : "blush",
      params: { ...base, shade: blush.name, ...(faceShape ? { shape: faceShape } : {}) },
    },
    {
      category: "eye_shadow",
      colors: shadow.colors,
      intensity: shadowIntensity,
      pattern: SHADOW_PATTERN,
      code: main ? "eyes_let_color_lead" : "eyes_depth_with_neutrals",
      params: { ...base, shade: shadow.name, ...(main ? { color: describeGarmentColor(main.hex).name } : {}) },
    },
    {
      category: "eye_liner",
      colors: [liner.hex],
      intensity: liner.intensity,
      pattern: LINER_PATTERN,
      code: `liner_${profile.contrast}`,
      params: { ...base, shade: liner.name, deltaL },
    },
    {
      category: "lip_color",
      colors: [lip.hex],
      intensity: 55 + level * 12,
      code: "lip",
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
