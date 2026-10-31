// The YouCam features Clara uses and how their task parameters are validated.
// Shared by the server routes and the browser client (no secrets here).

import { z } from "zod";

export const FEATURES = {
  /** Facial color tones: skin, lip, eye, eyebrow and hair colors (hex). */
  skinTone: "skin-tone-analysis",
  /** Clothes virtual try-on, latest engine. */
  cloth: "cloth-v4",
  /** Clothes virtual try-on, previous engine (fallback). */
  clothLegacy: "cloth",
  /** Makeup virtual try-on (lipstick rescue). */
  makeup: "makeup-vto",
  /** Background removal, used to isolate the garment before measuring its color. */
  removeBackground: "sod",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

export const ALLOWED_FEATURES = new Set<string>(Object.values(FEATURES));

export function isFeature(value: string): value is Feature {
  return ALLOWED_FEATURES.has(value);
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const lipEffectSchema = z.object({
  category: z.literal("lip_color"),
  shape: z.object({ name: z.string().default("original") }),
  style: z.object({ type: z.enum(["full", "ombre", "twoTone"]) }),
  palettes: z
    .array(
      z.object({
        color: hex,
        texture: z.enum(["matte", "gloss", "satin", "sheer"]),
        colorIntensity: z.number().int().min(0).max(100),
        gloss: z.number().int().min(0).max(100).optional(),
        transparencyIntensity: z.number().int().min(0).max(100).optional(),
      }),
    )
    .min(1)
    .max(2),
});

export const PARAM_SCHEMAS: Record<Feature, z.ZodType<Record<string, unknown>>> = {
  "skin-tone-analysis": z.object({
    face_angle_strictness_level: z.enum(["strict", "high", "medium", "low", "flexible"]).default("medium"),
  }),
  "cloth-v4": z.object({
    garment_category: z.enum(["upper_body", "lower_body", "full_body", "outer", "auto"]),
    change_shoes: z.boolean().default(false),
    filter_multi_person: z.enum(["off", "normal", "strict"]).default("normal"),
  }),
  cloth: z.object({
    garment_category: z.enum(["upper_body", "lower_body", "full_body", "auto"]),
    change_shoes: z.boolean().default(false),
  }),
  "makeup-vto": z.object({
    effects: z.array(lipEffectSchema).min(1).max(1),
    version: z.literal("1.0").default("1.0"),
  }),
  sod: z.object({}),
};

/** Which uploaded images each feature takes. */
export const FEATURE_INPUTS: Record<Feature, { ref: boolean }> = {
  "skin-tone-analysis": { ref: false },
  "cloth-v4": { ref: true },
  cloth: { ref: true },
  "makeup-vto": { ref: false },
  sod: { ref: false },
};

export function lipstickEffect(hexColor: string) {
  return {
    effects: [
      {
        category: "lip_color" as const,
        shape: { name: "original" },
        style: { type: "full" as const },
        palettes: [{ color: hexColor, texture: "satin" as const, colorIntensity: 70 }],
      },
    ],
    version: "1.0" as const,
  };
}
