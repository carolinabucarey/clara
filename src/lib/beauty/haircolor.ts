// Suggested hair colors: shades in the person's undertone, as close as possible to the
// depth of the hair they have, so the new color still reads as theirs. Only the color
// changes: YouCam's hair color try-on dyes the hair in the photo and leaves the cut alone.

import { deltaE, hexToLab } from "../color/lab";
import type { ColorProfile, Depth, HairColorStep, Undertone } from "../types";

/** Dye shades per undertone, lightest first; `name` is an i18n key under `shades`. */
const SHADES: Record<Undertone, Array<{ hex: string; name: string }>> = {
  warm: [
    { hex: "#e0c28c", name: "light_golden_blonde" },
    { hex: "#c9a063", name: "golden_blonde" },
    { hex: "#c4875a", name: "strawberry_blonde" },
    { hex: "#a7743a", name: "honey" },
    { hex: "#8a5a33", name: "caramel" },
    { hex: "#9c4a26", name: "copper" },
    { hex: "#5c3a21", name: "golden_brown" },
    { hex: "#3e2716", name: "warm_chocolate" },
  ],
  cool: [
    { hex: "#ddd6cb", name: "platinum" },
    { hex: "#b3a58e", name: "ash_blonde" },
    { hex: "#8f8170", name: "dark_ash_blonde" },
    { hex: "#6e5d50", name: "ash_brown" },
    { hex: "#4a3b35", name: "cool_brown" },
    { hex: "#5b1f2b", name: "burgundy" },
    { hex: "#2a1f1b", name: "espresso" },
    { hex: "#16171c", name: "blue_black" },
  ],
  neutral: [
    { hex: "#d2bc9a", name: "sand_blonde" },
    { hex: "#bfa07e", name: "beige_blonde" },
    { hex: "#9a7f62", name: "dark_blonde" },
    { hex: "#8e6b4d", name: "bronde" },
    { hex: "#6b4130", name: "chestnut" },
    { hex: "#46302a", name: "chocolate" },
    { hex: "#241b1a", name: "soft_black" },
  ],
};

/** Hair lightness to aim for when the hair could not be read, from the skin's depth. */
const DEFAULT_HAIR_L: Record<Depth, number> = { light: 45, medium: 30, deep: 18 };

/** Below this ΔE a shade is the person's own color again, not a change worth trying. */
const SAME_AS_OWN = 8;

/** Clara's `n` hair colors for this coloring, closest to the person's own depth first. */
export function hairColorsFor(profile: ColorProfile, n = 3): HairColorStep[] {
  const own = profile.hair ?? null;
  const targetL = own?.L ?? DEFAULT_HAIR_L[profile.depth];
  const params = { undertone: profile.undertone, skinHue: Math.round(profile.skinHue) };
  return SHADES[profile.undertone]
    .map((s, i) => ({ ...s, lab: hexToLab(s.hex), i }))
    .filter((s) => !own || deltaE(s.lab, own) >= SAME_AS_OWN)
    .sort((a, b) => Math.abs(a.lab.L - targetL) - Math.abs(b.lab.L - targetL) || a.i - b.i)
    .slice(0, n)
    .map((s) => ({ hex: s.hex, code: profile.undertone, params: { ...params, shade: s.name } }));
}
