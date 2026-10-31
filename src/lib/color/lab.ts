// Color math: sRGB <-> CIELAB (D65) <-> LCh. Pure functions, no DOM.

export type RGB = { r: number; g: number; b: number }; // 0..255
export type Lab = { L: number; a: number; b: number };
export type LCh = { L: number; C: number; h: number }; // h in degrees 0..360

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function hexToRgb(hex: string): RGB {
  const m = HEX_RE.exec(hex.trim());
  if (!m) throw new Error(`Invalid hex color: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const fromLinear = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v * 255;
};

// D65 reference white
const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

export function rgbToLab({ r, g, b }: RGB): Lab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / XN;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) / YN;
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / ZN;
  const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb({ L, a, b }: Lab): RGB {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const finv = (t: number) => {
    const t3 = t * t * t;
    return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
  };
  const X = finv(fx) * XN;
  const Y = (L > KAPPA * EPS ? Math.pow((L + 16) / 116, 3) : L / KAPPA) * YN;
  const Z = finv(fz) * ZN;
  const R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  const G = X * -0.969266 + Y * 1.8760108 + Z * 0.041556;
  const B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;
  return { r: fromLinear(R), g: fromLinear(G), b: fromLinear(B) };
}

export function labToLch({ L, a, b }: Lab): LCh {
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function lchToLab({ L, C, h }: LCh): Lab {
  const rad = (h * Math.PI) / 180;
  return { L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

export function hexToLch(hex: string): LCh {
  return labToLch(hexToLab(hex));
}

export function labToHex(lab: Lab): string {
  return rgbToHex(labToRgb(lab));
}

/** CIE76 color difference: good enough for clustering and coarse comparisons. */
export function deltaE(x: Lab, y: Lab): number {
  return Math.sqrt((x.L - y.L) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2);
}

/** Individual Typology Angle, a standard skin-lightness index (degrees). */
export function ita({ L, b }: Lab): number {
  return (Math.atan2(L - 50, b) * 180) / Math.PI;
}

/** Smallest absolute difference between two hue angles, in degrees. */
export function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}
