// Recolors a garment image toward a target color while keeping its shading:
// pixels close to the garment's main color are shifted in CIELAB by the same
// offset (a*, b*) and a scaled lightness offset, so folds and shadows survive.
// Trims, buttons and prints far from the main color are left untouched.

import { deltaE, hexToLab, labToRgb, rgbToLab } from "./lab";

export interface RecolorOptions {
  /** Max ΔE from the source color for a pixel to be recolored. */
  tolerance?: number;
  /** How much of the lightness difference to transfer (1 = all of it). */
  lightness?: number;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Recolors RGBA pixels in place. Returns how many pixels changed. */
export function recolorPixels(
  data: Uint8ClampedArray,
  sourceHex: string,
  targetHex: string,
  { tolerance = 28, lightness = 0.85 }: RecolorOptions = {},
): number {
  const src = hexToLab(sourceHex);
  const dst = hexToLab(targetHex);
  const dL = (dst.L - src.L) * lightness;
  const da = dst.a - src.a;
  const db = dst.b - src.b;
  let changed = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) continue;
    const lab = rgbToLab({ r: data[i], g: data[i + 1], b: data[i + 2] });
    const d = deltaE(lab, src);
    if (d > tolerance) continue;
    // Feather the edge of the tolerance so the transition is not posterized.
    const w = d < tolerance * 0.7 ? 1 : 1 - (d - tolerance * 0.7) / (tolerance * 0.3);
    const rgb = labToRgb({ L: lab.L + dL * w, a: lab.a + da * w, b: lab.b + db * w });
    data[i] = clamp(rgb.r);
    data[i + 1] = clamp(rgb.g);
    data[i + 2] = clamp(rgb.b);
    changed++;
  }
  return changed;
}

/** Composites RGBA pixels over a solid background, making them fully opaque (in place). */
export function flattenOnto(data: Uint8ClampedArray, background: [number, number, number] = [255, 255, 255]) {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a >= 1) continue;
    data[i] = clamp(data[i] * a + background[0] * (1 - a));
    data[i + 1] = clamp(data[i + 1] * a + background[1] * (1 - a));
    data[i + 2] = clamp(data[i + 2] * a + background[2] * (1 - a));
    data[i + 3] = 255;
  }
}
