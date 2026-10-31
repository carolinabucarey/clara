// Validation for verdict requests coming from the browser.

import { z } from "zod";
import { ATTR_NAMES } from "../garment/defaults";
import {
  FITS,
  GARMENT_CATEGORIES,
  LEGS,
  LENGTHS,
  NECKLINES,
  PATTERNS,
  RISES,
  SHOWN_ON,
  SLEEVES,
  WAISTS,
} from "../types";

const conf = z.enum(["high", "medium", "low"]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// The rounded sRGB conversion matrix can put white a few millionths above L=100.
const measured = z.object({ hex, L: z.number().min(-0.001).max(100.001), a: z.number(), b: z.number(), C: z.number().nonnegative(), h: z.number().min(0).max(360) });
const range = z.object({ value: z.number().positive(), low: z.number(), high: z.number() })
  .refine((r) => r.low <= r.value && r.value <= r.high, "Invalid measurement range");
const coordinate = z.number().min(0).max(1);
const line = z.object({ y: coordinate, x1: coordinate, x2: coordinate })
  .refine((l) => l.x1 <= l.x2, "Invalid overlay line");
const issues = z.array(z.string().regex(/^[a-z_]{1,50}$/)).max(20);

export const VerdictRequestSchema = z.object({
  locale: z.enum(["en", "es"]),
  goals: z.array(z.enum(["elongate", "show_waist", "balance", "show_shoulders"])).max(4).default([]),
  profile: z.object({
    undertone: z.enum(["warm", "cool", "neutral"]),
    depth: z.enum(["light", "medium", "deep"]),
    contrast: z.enum(["low", "medium", "high"]),
    skin: measured,
    hair: measured.optional(),
    eye: measured.optional(),
    lip: measured.optional(),
    skinHue: z.number(),
    ita: z.number(),
    contrastDeltaL: z.number().nullable(),
    confidence: conf,
    issues,
    corrected: z.boolean().optional(),
  }),
  proportions: z.object({
    balance: z.enum(["shoulders_wider", "balanced", "hips_wider"]),
    waist: z.enum(["defined", "moderate", "straight"]),
    torso: z.enum(["long_torso", "balanced", "long_legs"]),
    height: z.enum(["petite", "average", "tall"]),
    heightCm: z.number().min(100).max(230),
    shoulderHip: range,
    waistHip: range,
    torsoLeg: range.nullable(),
    confidence: conf,
    issues,
    lines: z.object({ shoulder: line, waist: line, hip: line }),
    corrected: z.boolean().optional(),
  }),
  garment: z.object({
    category: z.enum(GARMENT_CATEGORIES),
    neckline: z.enum(NECKLINES),
    sleeves: z.enum(SLEEVES),
    length: z.enum(LENGTHS),
    fit: z.enum(FITS),
    waist: z.enum(WAISTS),
    rise: z.enum(RISES),
    leg: z.enum(LEGS),
    pattern: z.enum(PATTERNS),
    shownOn: z.enum(SHOWN_ON),
    confidence: conf,
    uncertain: z.array(z.enum(ATTR_NAMES)).max(ATTR_NAMES.length),
  }),
  garmentColor: z.object({
    hex,
    L: z.number(),
    C: z.number(),
    h: z.number(),
    temperature: z.enum(["warm", "cool", "balanced", "achromatic"]),
    value: z.enum(["light", "mid", "dark"]),
    chroma: z.enum(["muted", "medium", "bright"]),
    name: z.string().max(40),
    share: z.number().min(0).max(1),
  }),
});
