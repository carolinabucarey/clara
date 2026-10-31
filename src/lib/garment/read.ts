// Reads a garment's construction from its photo with Claude (vision). Claude only
// describes the garment; color is measured by our own code and the user confirms
// every attribute.

import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CLAUDE_MODEL, claude } from "../claude/client";
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
  type GarmentAttributes,
} from "../types";

const ATTR_NAMES = ["category", "neckline", "sleeves", "length", "fit", "waist", "rise", "leg", "pattern"] as const;

export const GarmentReadSchema = z.object({
  is_garment: z.boolean(),
  category: z.enum(GARMENT_CATEGORIES),
  neckline: z.enum(NECKLINES),
  sleeves: z.enum(SLEEVES),
  length: z.enum(LENGTHS),
  fit: z.enum(FITS),
  waist: z.enum(WAISTS),
  rise: z.enum(RISES),
  leg: z.enum(LEGS),
  pattern: z.enum(PATTERNS),
  shown_on: z.enum(SHOWN_ON),
  confidence: z.enum(["high", "medium", "low"]),
  uncertain_fields: z.array(z.enum(ATTR_NAMES)),
});

const SYSTEM = `You describe garments from product photos and screenshots for a virtual try-on and a fit analysis.
Describe only the single main garment being shown (the product for sale), choosing the closest option for each field.
- category: upper_body (tops, shirts, blouses, sweaters, t-shirts), lower_body (pants, jeans, skirts, shorts), full_body (dresses, jumpsuits), outer (jackets, coats, blazers, cardigans).
- length: for tops use cropped, waist, hip or tunic; for dresses and skirts use mini, knee, midi or maxi; for pants use ankle or full_length.
- Use "none" (neckline, sleeves) or "na" (rise, leg) when a field does not apply to this category.
- waist: "defined" if the garment shapes the waist, "belted" if it has a belt or tie, "high_waisted" for high-rise bottoms, "undefined" otherwise.
- shown_on: whether the photo shows it on a model, flat lay, mannequin or hanger.
List in uncertain_fields any field you could not see well. Set is_garment to false if there is no garment.
Never judge whether the garment is flattering and never describe the model's body.`;

export async function readGarment(image: Uint8Array, mediaType: "image/jpeg" | "image/png") {
  const res = await claude().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(GarmentReadSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(image).toString("base64") } },
          { type: "text", text: "Describe this garment." },
        ],
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("garment_read_failed");
  return res.parsed_output;
}

export function toAttributes(read: z.infer<typeof GarmentReadSchema>): GarmentAttributes {
  return {
    category: read.category,
    neckline: read.neckline,
    sleeves: read.sleeves,
    length: read.length,
    fit: read.fit,
    waist: read.waist,
    rise: read.rise,
    leg: read.leg,
    pattern: read.pattern,
    shownOn: read.shown_on,
    confidence: read.confidence,
    uncertain: read.uncertain_fields,
  };
}

export const DEFAULT_ATTRIBUTES: GarmentAttributes = {
  category: "upper_body",
  neckline: "crew",
  sleeves: "long",
  length: "hip",
  fit: "straight",
  waist: "undefined",
  rise: "na",
  leg: "na",
  pattern: "solid",
  shownOn: "flat_lay",
  confidence: "low",
  uncertain: [...ATTR_NAMES],
};
