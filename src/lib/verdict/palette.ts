// Style palettes by undertone and contrast, lipstick shades by undertone and depth.
// Presented as style advice, not science: the verdict cites the measured numbers.

import { hexToLch, hueDistance } from "../color/lab";
import type { ColorProfile, Contrast, Depth, Undertone } from "../types";

const PALETTES: Record<Undertone, Record<Contrast, string[]>> = {
  warm: {
    low: ["#c8a27a", "#e3a587", "#9a9b6a", "#d9b48f", "#7f9c8f", "#f3e6cf"],
    medium: ["#c1834a", "#e2725b", "#6b7a3a", "#b5523b", "#2e8b84", "#efe1c6"],
    high: ["#9c4a1a", "#e2552b", "#3f5e2a", "#8e2f1f", "#00756f", "#f5ecd7"],
  },
  cool: {
    low: ["#8fa4c4", "#c99ab0", "#9fb8b2", "#b6a6cc", "#7d8696", "#eef0f4"],
    medium: ["#2f4f8f", "#b0477a", "#2e7d6b", "#6f4c9b", "#4a5260", "#f4f6fb"],
    high: ["#14244d", "#c2185b", "#00694f", "#4b2a85", "#1c1f26", "#ffffff"],
  },
  neutral: {
    low: ["#a8b5c4", "#cf9a9e", "#9bb4a0", "#c4a98f", "#8e8a88", "#f1ede8"],
    medium: ["#3d5a80", "#c2465a", "#3c8d7a", "#9c6b4f", "#5a5a66", "#f6f2ec"],
    high: ["#1d2f52", "#b3263a", "#006d5b", "#6b3a2a", "#25252b", "#fbfaf7"],
  },
};

const LIPSTICKS: Record<Undertone, Record<Depth, { hex: string; name: string }>> = {
  warm: {
    light: { hex: "#e0705a", name: "coral" },
    medium: { hex: "#b5523b", name: "terracotta" },
    deep: { hex: "#8e3b2f", name: "brick" },
  },
  cool: {
    light: { hex: "#c8507a", name: "rose" },
    medium: { hex: "#9e2f5e", name: "berry" },
    deep: { hex: "#6e1f45", name: "plum" },
  },
  neutral: {
    light: { hex: "#c4525a", name: "rosewood" },
    medium: { hex: "#b3263a", name: "true_red" },
    deep: { hex: "#7e2433", name: "wine" },
  },
};

export function paletteFor(profile: Pick<ColorProfile, "undertone" | "contrast">): string[] {
  return PALETTES[profile.undertone][profile.contrast];
}

export function lipstickFor(profile: Pick<ColorProfile, "undertone" | "depth">) {
  return LIPSTICKS[profile.undertone][profile.depth];
}

/** Palette color closest in hue to the garment: "the same piece, in your color". */
export function closestPaletteColor(palette: string[], garmentHex: string): string | null {
  const g = hexToLch(garmentHex);
  if (g.C < 10) {
    // Achromatic garments: pick the palette's deepest or lightest neutral by value.
    const sorted = [...palette].sort((a, b) => Math.abs(hexToLch(a).L - g.L) - Math.abs(hexToLch(b).L - g.L));
    return sorted[0] ?? null;
  }
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of palette) {
    const c = hexToLch(p);
    if (c.C < 10) continue;
    const d = hueDistance(c.h, g.h) + Math.abs(c.L - g.L) * 0.3;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
