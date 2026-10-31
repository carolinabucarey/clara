// Hair color across a hairstyle try-on. YouCam keeps "the user's color" by its own
// reading of the photo, and some photos read wrong (dark hair with highlights came
// back platinum). With a local hair mask on both photos we measure the color before
// and after, and when it moved we carry the original hair's color onto the new hair:
// its lightness by percentile (the same spread of dark under-layers and highlights)
// and its hue by mean and spread in CIELAB. The cut stays, the shading of the new
// strands stays, and the color is the person's again.

import { deltaE, labToRgb, rgbToLab, type Lab } from "./lab";

export interface HairMask {
  /** Hair confidence per pixel, 0..1, row-major. */
  data: Float32Array;
  width: number;
  height: number;
}

export interface HairStats {
  mean: Lab;
  std: Lab;
  /** Lightness at each percentile, 0 to 100. */
  lightness: Float32Array;
  /** Share of the photo that is hair. */
  share: number;
}

/** Below this share of the photo, the hair is too little to read (bald, cap, cropped). */
export const MIN_HAIR_SHARE = 0.01;
/** ΔE between the hair before and after above which the try-on changed the color. */
export const HAIR_SHIFT_MAX = 15;

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** The mask's confidence at an image pixel; the mask may be at another resolution. */
function maskAt(mask: HairMask, x: number, y: number, width: number, height: number): number {
  const mx = Math.min(mask.width - 1, Math.floor((x * mask.width) / width));
  const my = Math.min(mask.height - 1, Math.floor((y * mask.height) / height));
  return mask.data[my * mask.width + mx];
}

/** Lab mean and spread of the confidently-hair pixels; null when there is too little hair. */
export function hairStats(pixels: Uint8ClampedArray, width: number, height: number, mask: HairMask): HairStats | null {
  let n = 0;
  const sum = { L: 0, a: 0, b: 0 };
  const sq = { L: 0, a: 0, b: 0 };
  const Ls = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (maskAt(mask, x, y, width, height) < 0.5) continue;
      const i = (y * width + x) * 4;
      const lab = rgbToLab({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
      Ls[n] = lab.L;
      n++;
      sum.L += lab.L;
      sum.a += lab.a;
      sum.b += lab.b;
      sq.L += lab.L * lab.L;
      sq.a += lab.a * lab.a;
      sq.b += lab.b * lab.b;
    }
  }
  const share = n / (width * height);
  if (share < MIN_HAIR_SHARE) return null;
  const mean = { L: sum.L / n, a: sum.a / n, b: sum.b / n };
  const sd = (s: number, m: number) => Math.sqrt(Math.max(0, s / n - m * m));
  const sorted = Ls.subarray(0, n).sort();
  const lightness = Float32Array.from({ length: 101 }, (_, p) => sorted[Math.round((p / 100) * (n - 1))]);
  return { mean, std: { L: sd(sq.L, mean.L), a: sd(sq.a, mean.a), b: sd(sq.b, mean.b) }, lightness, share };
}

/** The lightness at the same percentile of `to` as `L` is in `from` (clamped at the ends). */
export function matchLightness(L: number, from: Float32Array, to: Float32Array): number {
  const last = from.length - 1;
  if (L <= from[0]) return to[0];
  if (L >= from[last]) return to[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (from[mid] <= L) lo = mid;
    else hi = mid;
  }
  const span = from[hi] - from[lo];
  return to[lo] + (to[hi] - to[lo]) * (span > 0 ? (L - from[lo]) / span : 0);
}

/** Whether the try-on moved the hair color away from the person's. */
export function hairColorChanged(before: HairStats, after: HairStats): boolean {
  return deltaE(before.mean, after.mean) > HAIR_SHIFT_MAX;
}

/**
 * Recolors the hair in place so its color matches `target`'s, keeping each strand's
 * light and shade relative to the rest. The mask's soft edge blends the
 * change out, so flyaways and the hairline do not get a hard border, and only pixels
 * whose hue looks like the current hair change: the mask can spill onto skin.
 */
export function transferHairColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mask: HairMask,
  current: HairStats,
  target: HairStats,
) {
  // Flat new hair would turn noise into texture: keep the scaling within reason.
  const scale = (to: number, from: number) => Math.max(0.5, Math.min(2, from > 0.5 ? to / from : 1));
  const ka = scale(target.std.a, current.std.a);
  const kb = scale(target.std.b, current.std.b);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const m = maskAt(mask, x, y, width, height);
      if (m < 0.05) continue;
      const i = (y * width + x) * 4;
      const lab = rgbToLab({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
      const hue = Math.hypot(
        (lab.a - current.mean.a) / Math.max(3, current.std.a),
        (lab.b - current.mean.b) / Math.max(3, current.std.b),
      );
      const w = Math.min(1, (m - 0.05) / 0.25) * Math.max(0, Math.min(1, (3.5 - hue) / 1.5));
      if (w === 0) continue;
      const L = matchLightness(lab.L, current.lightness, target.lightness);
      const a = (lab.a - current.mean.a) * ka + target.mean.a;
      const b = (lab.b - current.mean.b) * kb + target.mean.b;
      const rgb = labToRgb({ L: lab.L + (L - lab.L) * w, a: lab.a + (a - lab.a) * w, b: lab.b + (b - lab.b) * w });
      pixels[i] = clamp(rgb.r);
      pixels[i + 1] = clamp(rgb.g);
      pixels[i + 2] = clamp(rgb.b);
    }
  }
}
