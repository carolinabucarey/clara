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
  /** Makeup virtual try-on (lipstick rescue and the suggested makeup look). */
  makeup: "makeup-vto",
  /** Background removal, used to isolate the garment before measuring its color. */
  removeBackground: "sod",
  /** Hair color try-on: dyes the hair the person has, without touching the cut. */
  hairColor: "hair-color",
  /** Face attributes: Clara only asks for the face shape and its aspect ratio. */
  faceAnalyzer: "face-attr-analysis",
} as const;

export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

export const ALLOWED_FEATURES = new Set<string>(Object.values(FEATURES));

export function isFeature(value: string): value is Feature {
  return ALLOWED_FEATURES.has(value);
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const intensity = z.number().int().min(0).max(100);

export const lipEffectSchema = z.object({
  category: z.literal("lip_color"),
  shape: z.object({ name: z.string().default("original") }),
  style: z.object({ type: z.enum(["full", "ombre", "twoTone"]) }),
  palettes: z
    .array(
      z.object({
        color: hex,
        texture: z.enum(["matte", "gloss", "satin", "sheer"]),
        colorIntensity: intensity,
        gloss: intensity.optional(),
        transparencyIntensity: intensity.optional(),
      }),
    )
    .min(1)
    .max(2),
});

// Pattern names must be labels from YouCam's catalogs (plugins-media.makeupar.com/wcm-saas/patterns/*.json).
const pattern = z.object({ name: z.string().regex(/^[A-Za-z0-9&]{2,24}$/) });

export const blushEffectSchema = z.object({
  category: z.literal("blush"),
  pattern,
  palettes: z.array(z.object({ color: hex, texture: z.literal("matte"), colorIntensity: intensity })).min(1).max(3),
});

const eyePalette = z.object({ color: hex, texture: z.literal("matte"), colorIntensity: intensity });

export const eyeShadowEffectSchema = z.object({
  category: z.literal("eye_shadow"),
  pattern,
  palettes: z.array(eyePalette).min(1).max(5),
});

export const eyeLinerEffectSchema = z.object({
  category: z.literal("eye_liner"),
  pattern,
  palettes: z.array(eyePalette).min(1).max(3),
});

export const makeupEffectSchema = z.discriminatedUnion("category", [
  lipEffectSchema,
  blushEffectSchema,
  eyeShadowEffectSchema,
  eyeLinerEffectSchema,
]);

export type MakeupEffect = z.infer<typeof makeupEffectSchema>;

export const FACE_ATTRIBUTES = ["faceShape", "faceAspectRatio"] as const;

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
    effects: z.array(makeupEffectSchema).min(1).max(6),
    version: z.literal("1.0").default("1.0"),
  }),
  sod: z.object({}),
  "hair-color": z.object({
    pattern: z.object({ name: z.literal("full") }),
    palettes: z
      .array(z.object({ color: hex, color_intensity: intensity, shine_intensity: intensity.optional() }))
      .length(1),
  }),
  "face-attr-analysis": z.object({
    features: z.array(z.enum(FACE_ATTRIBUTES)).min(1).max(FACE_ATTRIBUTES.length),
    face_angle_strictness_level: z.enum(["strict", "high", "medium", "low", "flexible"]).default("medium"),
  }),
};

/** Which uploaded images each feature takes. */
export const FEATURE_INPUTS: Record<Feature, { ref: boolean }> = {
  "skin-tone-analysis": { ref: false },
  "cloth-v4": { ref: true },
  cloth: { ref: true },
  "makeup-vto": { ref: false },
  sod: { ref: false },
  "hair-color": { ref: false },
  "face-attr-analysis": { ref: false },
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

/** A single dye color over the whole head, strong enough to read, with a natural shine. */
export function hairColorParams(hexColor: string) {
  return {
    pattern: { name: "full" as const },
    palettes: [{ color: hexColor, color_intensity: 70, shine_intensity: 40 }],
  };
}
