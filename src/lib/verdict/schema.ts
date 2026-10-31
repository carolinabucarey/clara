// Validation for verdict requests coming from the browser.

import { z } from "zod";
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
const measured = z.object({ hex: z.string(), L: z.number(), a: z.number(), b: z.number(), C: z.number(), h: z.number() });
const range = z.object({ value: z.number(), low: z.number(), high: z.number() });
const line = z.object({ y: z.number(), x1: z.number(), x2: z.number() });

export const VerdictRequestSchema = z.object({
  locale: z.enum(["en", "es"]),
  goals: z.array(z.enum(["elongate", "show_waist", "balance", "show_shoulders"])).default([]),
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
    issues: z.array(z.string()),
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
    issues: z.array(z.string()),
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
    uncertain: z.array(z.string()),
  }),
  garmentColor: z.object({
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    L: z.number(),
    C: z.number(),
    h: z.number(),
    temperature: z.enum(["warm", "cool", "balanced", "achromatic"]),
    value: z.enum(["light", "mid", "dark"]),
    chroma: z.enum(["muted", "medium", "bright"]),
    name: z.string(),
    share: z.number(),
  }),
});
