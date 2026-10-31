// Dominant colors of a garment image via k-means in CIELAB. Pure: takes raw RGBA
// pixels, so it runs in the browser (canvas) and in tests.

import { deltaE, labToHex, rgbToLab, type Lab } from "./lab";

export interface ColorCluster {
  hex: string;
  lab: Lab;
  share: number;
}

export interface DominantOptions {
  k?: number;
  maxSamples?: number;
  /** Optional region of interest in pixels. */
  region?: { x: number; y: number; width: number; height: number };
  /** Seed for the deterministic sampler (tests). */
  seed?: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Background estimate for opaque images: the median color of the border pixels.
 * Product photos almost always sit on a plain backdrop.
 */
function borderColor(data: Uint8ClampedArray, width: number, height: number): Lab {
  const samples: Lab[] = [];
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    samples.push(rgbToLab({ r: data[i], g: data[i + 1], b: data[i + 2] }));
  };
  const stepX = Math.max(1, Math.floor(width / 60));
  const stepY = Math.max(1, Math.floor(height / 60));
  for (let x = 0; x < width; x += stepX) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    push(0, y);
    push(width - 1, y);
  }
  const med = (vals: number[]) => vals.sort((p, q) => p - q)[Math.floor(vals.length / 2)];
  return { L: med(samples.map((s) => s.L)), a: med(samples.map((s) => s.a)), b: med(samples.map((s) => s.b)) };
}

export function dominantColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: DominantOptions = {},
): ColorCluster[] {
  const k = options.k ?? 4;
  const maxSamples = options.maxSamples ?? 12000;
  const rand = mulberry32(options.seed ?? 7);
  const region = options.region ?? { x: 0, y: 0, width, height };
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(width, Math.ceil(region.x + region.width));
  const y1 = Math.min(height, Math.ceil(region.y + region.height));

  // Transparent pixels mean the background was already removed (YouCam sod).
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4 * 97) {
    if (data[i] < 250) {
      hasAlpha = true;
      break;
    }
  }
  const bg = hasAlpha ? null : borderColor(data, width, height);

  const area = (x1 - x0) * (y1 - y0);
  const step = Math.max(1, Math.floor(Math.sqrt(area / maxSamples)));
  const points: Lab[] = [];
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const lab = rgbToLab({ r: data[i], g: data[i + 1], b: data[i + 2] });
      if (bg && deltaE(lab, bg) < 10) continue;
      points.push(lab);
    }
  }
  if (points.length === 0) return [];

  // k-means++ initialisation
  const centers: Lab[] = [points[Math.floor(rand() * points.length)]];
  while (centers.length < Math.min(k, points.length)) {
    const d2 = points.map((p) => Math.min(...centers.map((c) => deltaE(p, c) ** 2)));
    const total = d2.reduce((s, v) => s + v, 0);
    if (total === 0) break;
    let r = rand() * total;
    let idx = 0;
    while (r > d2[idx] && idx < d2.length - 1) {
      r -= d2[idx];
      idx++;
    }
    centers.push(points[idx]);
  }

  const assign = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let p = 0; p < points.length; p++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = deltaE(points[p], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[p] !== best) {
        assign[p] = best;
        moved = true;
      }
    }
    const sums = centers.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    points.forEach((p, i) => {
      const s = sums[assign[i]];
      s.L += p.L;
      s.a += p.a;
      s.b += p.b;
      s.n++;
    });
    sums.forEach((s, c) => {
      if (s.n > 0) centers[c] = { L: s.L / s.n, a: s.a / s.n, b: s.b / s.n };
    });
    if (!moved && iter > 0) break;
  }

  const counts = centers.map(() => 0);
  assign.forEach((c) => counts[c]++);
  const clusters = centers
    .map((lab, c) => ({ lab, share: counts[c] / points.length, hex: labToHex(lab) }))
    .filter((c) => c.share > 0);

  // Merge clusters that are visually the same color.
  clusters.sort((p, q) => q.share - p.share);
  const merged: ColorCluster[] = [];
  for (const c of clusters) {
    const twin = merged.find((m) => deltaE(m.lab, c.lab) < 8);
    if (twin) {
      const total = twin.share + c.share;
      twin.lab = {
        L: (twin.lab.L * twin.share + c.lab.L * c.share) / total,
        a: (twin.lab.a * twin.share + c.lab.a * c.share) / total,
        b: (twin.lab.b * twin.share + c.lab.b * c.share) / total,
      };
      twin.share = total;
      twin.hex = labToHex(twin.lab);
    } else {
      merged.push({ ...c });
    }
  }
  return merged.sort((p, q) => q.share - p.share);
}

/** A garment reads as a print when a second, clearly different color covers a lot of it. */
export function looksMulticolor(clusters: ColorCluster[]): boolean {
  if (clusters.length < 2) return false;
  const [first, second] = clusters;
  return second.share > 0.28 && deltaE(first.lab, second.lab) > 25;
}
