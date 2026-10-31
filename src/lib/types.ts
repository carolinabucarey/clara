// Shared domain types for Clara. Everything here is plain data (JSON-safe) so it
// can travel between the browser, the API routes and the language model.

export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export function minConfidence(...values: Confidence[]): Confidence {
  return values.reduce((acc, v) => (CONFIDENCE_RANK[v] < CONFIDENCE_RANK[acc] ? v : acc), "high");
}

// ---------- Color profile (from YouCam skin-tone analysis) ----------

export type Undertone = "warm" | "cool" | "neutral";
export type Depth = "light" | "medium" | "deep";
export type Contrast = "low" | "medium" | "high";

export interface MeasuredColor {
  hex: string;
  L: number;
  a: number;
  b: number;
  C: number;
  h: number;
}

export interface ColorProfile {
  undertone: Undertone;
  depth: Depth;
  contrast: Contrast;
  skin: MeasuredColor;
  hair?: MeasuredColor;
  eye?: MeasuredColor;
  lip?: MeasuredColor;
  /** Skin hue angle in degrees: the main evidence for undertone. */
  skinHue: number;
  /** Individual Typology Angle of the skin: the evidence for depth. */
  ita: number;
  /** Lightness gap between skin and the darkest of hair/eyes: evidence for contrast. */
  contrastDeltaL: number | null;
  confidence: Confidence;
  /** Codes explaining why confidence is lower (i18n keys under `issues`). */
  issues: string[];
  /** True when the user changed any classification by hand. */
  corrected?: boolean;
}

// ---------- Body proportions (from MediaPipe pose + segmentation) ----------

export type Balance = "shoulders_wider" | "balanced" | "hips_wider";
export type WaistShape = "defined" | "moderate" | "straight";
export type TorsoLegs = "long_torso" | "balanced" | "long_legs";
export type HeightClass = "petite" | "average" | "tall";

export interface RatioRange {
  value: number;
  low: number;
  high: number;
}

export interface OverlayLine {
  /** Normalized (0..1) coordinates in the body photo. */
  y: number;
  x1: number;
  x2: number;
}

export interface Proportions {
  balance: Balance;
  waist: WaistShape;
  torso: TorsoLegs;
  height: HeightClass;
  heightCm: number;
  shoulderHip: RatioRange;
  waistHip: RatioRange;
  torsoLeg: RatioRange | null;
  confidence: Confidence;
  issues: string[];
  lines: { shoulder: OverlayLine; waist: OverlayLine; hip: OverlayLine };
  corrected?: boolean;
}

// ---------- Garment ----------

export const GARMENT_CATEGORIES = ["upper_body", "lower_body", "full_body", "outer"] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

export const NECKLINES = [
  "crew",
  "v_neck",
  "scoop",
  "square",
  "boat",
  "high",
  "turtleneck",
  "off_shoulder",
  "halter",
  "strapless",
  "collared",
  "cowl",
  "none",
] as const;
export const SLEEVES = ["sleeveless", "short", "elbow", "three_quarter", "long", "none"] as const;
export const LENGTHS = [
  "cropped",
  "waist",
  "hip",
  "tunic",
  "mini",
  "knee",
  "midi",
  "maxi",
  "ankle",
  "full_length",
] as const;
export const FITS = ["fitted", "straight", "relaxed", "oversized", "a_line", "flared", "bodycon", "wrap"] as const;
export const WAISTS = ["defined", "undefined", "belted", "high_waisted"] as const;
export const RISES = ["high", "mid", "low", "na"] as const;
export const LEGS = ["skinny", "straight", "wide", "flare", "bootcut", "na"] as const;
export const PATTERNS = ["solid", "print", "stripes_horizontal", "stripes_vertical", "color_block"] as const;
export const SHOWN_ON = ["model", "flat_lay", "mannequin", "hanger"] as const;

export interface GarmentAttributes {
  category: GarmentCategory;
  neckline: (typeof NECKLINES)[number];
  sleeves: (typeof SLEEVES)[number];
  length: (typeof LENGTHS)[number];
  fit: (typeof FITS)[number];
  waist: (typeof WAISTS)[number];
  rise: (typeof RISES)[number];
  leg: (typeof LEGS)[number];
  pattern: (typeof PATTERNS)[number];
  shownOn: (typeof SHOWN_ON)[number];
  confidence: Confidence;
  /** Attribute names the reader was unsure about. */
  uncertain: string[];
}

export type ColorTemperature = "warm" | "cool" | "balanced" | "achromatic";
export type ColorValue = "light" | "mid" | "dark";
export type ColorChroma = "muted" | "medium" | "bright";

export interface GarmentColor {
  hex: string;
  L: number;
  C: number;
  h: number;
  temperature: ColorTemperature;
  value: ColorValue;
  chroma: ColorChroma;
  /** Basic color name key (i18n `colors.<name>`). */
  name: string;
  /** Share of garment pixels covered by this color (0..1). */
  share: number;
}

// ---------- Verdict ----------

export type Verdict = "flatters" | "works_with_tweaks" | "not_flattering";

export interface Evidence {
  code: string;
  polarity: "plus" | "minus" | "neutral";
  params?: Record<string, string | number>;
}

export interface AxisVerdict {
  verdict: Verdict;
  score: number;
  confidence: Confidence;
  evidence: Evidence[];
}

export type RescueKind =
  | "lipstick"
  | "color_near_face"
  | "metal"
  | "belt"
  | "tuck"
  | "layer"
  | "shoes"
  | "sleeves"
  | "longer_top"
  | "untuck";

export interface Rescue {
  kind: RescueKind;
  code: string;
  params?: Record<string, string | number>;
  /** For lipstick: shade to apply with YouCam makeup try-on. */
  lipstick?: { hex: string; name: string };
  /** Palette swatches to show next to the advice. */
  swatches?: string[];
}

export type Goal = "elongate" | "show_waist" | "balance" | "show_shoulders";
export type Occasion = "none" | "interview" | "wedding" | "date" | "everyday";

export interface VerdictResult {
  color: AxisVerdict;
  cut: AxisVerdict;
  rescues: Rescue[];
  /** Best colors from the user's palette, for the "better version". */
  palette: string[];
  /** Palette color closest to the garment's hue: the "same garment, better color". */
  betterColor: string | null;
}

export interface VerdictDraft {
  cut: { headline: string; body: string };
  color: { headline: string; body: string };
  rescue: { headline: string; body: string } | null;
  uncertainty: string | null;
  source: "claude" | "template";
}
