// Neutral starting attributes when the garment could not be read automatically.
// Every field is marked uncertain so the UI asks the user to choose.

import type { GarmentAttributes } from "../types";

export const ATTR_NAMES = ["category", "neckline", "sleeves", "length", "fit", "waist", "rise", "leg", "pattern"] as const;

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
