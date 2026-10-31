// Cut verdict: a rule table that crosses the garment's construction with the
// measured proportions and height. Rules speak in goals (balance the frame, show
// the waist, elongate), never in "flaws".

import type {
  AxisVerdict,
  Evidence,
  GarmentAttributes,
  Goal,
  Proportions,
  RescueKind,
} from "../types";
import { minConfidence } from "../types";

interface Ctx {
  p: Proportions;
  g: GarmentAttributes;
  isTop: boolean;
  isBottom: boolean;
  isFull: boolean;
  wideNeck: boolean;
  narrowingNeck: boolean;
  waistMarked: boolean;
  boxy: boolean;
  volumeBelow: boolean;
  fittedBottom: boolean;
}

export interface CutRule {
  code: string;
  goal: Goal;
  points: number;
  when: (c: Ctx) => boolean;
  /** How to make it work when this rule counts against the garment. */
  rescue?: RescueKind | ((c: Ctx) => RescueKind);
}

export const CUT_RULES: CutRule[] = [
  // Balance between shoulders and hips
  { code: "wide_neckline_balances", goal: "balance", points: 1.5, when: (c) => c.p.balance === "hips_wider" && (c.isTop || c.isFull) && c.wideNeck },
  { code: "volume_below_skims", goal: "balance", points: 1, when: (c) => c.p.balance === "hips_wider" && c.volumeBelow },
  { code: "fitted_bottom_draws_hips", goal: "balance", points: -0.5, when: (c) => c.p.balance === "hips_wider" && c.fittedBottom, rescue: "longer_top" },
  { code: "vneck_softens_shoulders", goal: "balance", points: 1.5, when: (c) => c.p.balance === "shoulders_wider" && (c.isTop || c.isFull) && c.narrowingNeck },
  { code: "wide_neckline_widens_shoulders", goal: "balance", points: -1, when: (c) => c.p.balance === "shoulders_wider" && (c.isTop || c.isFull) && c.wideNeck, rescue: "layer" },
  { code: "volume_below_balances_shoulders", goal: "balance", points: 1, when: (c) => c.p.balance === "shoulders_wider" && c.volumeBelow },
  { code: "balanced_frame_versatile", goal: "balance", points: 0.5, when: (c) => c.p.balance === "balanced" && (c.isTop || c.isFull) },

  // Waist
  { code: "boxy_skips_waist", goal: "show_waist", points: -1.5, when: (c) => c.p.waist === "defined" && !c.isBottom && c.boxy, rescue: (c) => (c.isTop ? "tuck" : "belt") },
  { code: "marks_defined_waist", goal: "show_waist", points: 1.5, when: (c) => c.p.waist === "defined" && !c.isBottom && c.waistMarked },
  { code: "high_rise_marks_waist", goal: "show_waist", points: 1, when: (c) => c.p.waist === "defined" && c.isBottom && c.g.rise === "high" },
  { code: "straight_cut_follows_line", goal: "balance", points: 1, when: (c) => c.p.waist === "straight" && !c.isBottom && (c.g.fit === "straight" || c.g.fit === "relaxed") },
  { code: "belt_creates_waist", goal: "show_waist", points: 0.5, when: (c) => c.p.waist === "straight" && !c.isBottom && (c.g.waist === "belted" || c.g.fit === "wrap") },

  // Torso and legs
  { code: "high_waist_balances_long_torso", goal: "elongate", points: 1.5, when: (c) => c.p.torso === "long_torso" && ((c.isBottom && c.g.rise === "high") || (c.isFull && (c.g.waist === "high_waisted" || c.g.waist === "defined"))) },
  { code: "long_top_extends_torso", goal: "elongate", points: -0.75, when: (c) => c.p.torso === "long_torso" && c.isTop && (c.g.length === "tunic" || c.g.length === "hip"), rescue: "tuck" },
  { code: "short_top_balances_long_torso", goal: "elongate", points: 1, when: (c) => c.p.torso === "long_torso" && c.isTop && (c.g.length === "cropped" || c.g.length === "waist") },
  { code: "high_rise_shortens_torso", goal: "balance", points: -0.5, when: (c) => c.p.torso === "long_legs" && c.isBottom && c.g.rise === "high", rescue: "untuck" },
  { code: "longer_top_balances_long_legs", goal: "balance", points: 1, when: (c) => c.p.torso === "long_legs" && c.isTop && (c.g.length === "hip" || c.g.length === "tunic") },
  { code: "cropped_shortens_torso", goal: "balance", points: -0.5, when: (c) => c.p.torso === "long_legs" && c.isTop && c.g.length === "cropped", rescue: "layer" },

  // Height and hem length
  { code: "midi_cuts_petite", goal: "elongate", points: -1, when: (c) => c.p.height === "petite" && (c.isFull || c.isBottom) && c.g.length === "midi", rescue: "shoes" },
  { code: "hem_above_knee_elongates", goal: "elongate", points: 1, when: (c) => c.p.height === "petite" && (c.isFull || c.isBottom) && (c.g.length === "mini" || c.g.length === "knee") },
  { code: "oversized_overwhelms_petite", goal: "elongate", points: -1, when: (c) => c.p.height === "petite" && c.g.fit === "oversized", rescue: (c) => (c.isTop ? "tuck" : "sleeves") },
  { code: "column_elongates", goal: "elongate", points: 0.5, when: (c) => c.p.height === "petite" && c.isFull && ["maxi", "full_length", "ankle"].includes(c.g.length) && ["fitted", "straight", "wrap", "bodycon"].includes(c.g.fit) },
  { code: "long_lines_suit_height", goal: "balance", points: 1, when: (c) => c.p.height === "tall" && (c.isFull || c.isBottom || c.g.category === "outer") && ["midi", "maxi", "full_length", "ankle"].includes(c.g.length) },

  // Lines and patterns
  { code: "vertical_stripes_elongate", goal: "elongate", points: 0.5, when: (c) => c.g.pattern === "stripes_vertical" },
  { code: "horizontal_stripes_widen", goal: "balance", points: -0.5, when: (c) => c.g.pattern === "stripes_horizontal" && c.isBottom && c.p.balance === "hips_wider", rescue: "longer_top" },
  { code: "high_wide_leg_elongates", goal: "elongate", points: 1, when: (c) => c.isBottom && (c.g.leg === "wide" || c.g.leg === "flare") && c.g.rise === "high" },
  { code: "shows_shoulders", goal: "show_shoulders", points: 0.25, when: (c) => (c.isTop || c.isFull) && ["off_shoulder", "strapless", "halter", "boat", "square"].includes(c.g.neckline) },
];

export function context(p: Proportions, g: GarmentAttributes): Ctx {
  const isTop = g.category === "upper_body" || g.category === "outer";
  const isBottom = g.category === "lower_body";
  const isFull = g.category === "full_body";
  return {
    p,
    g,
    isTop,
    isBottom,
    isFull,
    wideNeck: ["boat", "off_shoulder", "square", "strapless"].includes(g.neckline),
    narrowingNeck: ["v_neck", "scoop", "halter"].includes(g.neckline),
    waistMarked: ["wrap", "a_line", "fitted", "bodycon"].includes(g.fit) || ["defined", "belted", "high_waisted"].includes(g.waist),
    boxy: (g.fit === "oversized" || g.fit === "relaxed") && g.waist === "undefined",
    volumeBelow: (isBottom || isFull) && (["wide", "flare", "bootcut"].includes(g.leg) || g.fit === "a_line" || g.fit === "flared"),
    fittedBottom: isBottom && (g.leg === "skinny" || g.fit === "bodycon" || g.fit === "fitted"),
  };
}

export interface CutEvaluation extends AxisVerdict {
  rescueKinds: Array<{ kind: RescueKind; from: string }>;
}

export function evaluateCut(p: Proportions, g: GarmentAttributes, goals: Goal[] = []): CutEvaluation {
  const c = context(p, g);
  const evidence: Evidence[] = [];
  const rescueKinds: CutEvaluation["rescueKinds"] = [];
  let score = 0;
  for (const rule of CUT_RULES) {
    if (!rule.when(c)) continue;
    let pts = rule.points;
    if (goals.length > 0) pts *= goals.includes(rule.goal) ? (rule.goal === "show_shoulders" ? 4 : 1.5) : 0.75;
    score += pts;
    evidence.push({
      code: rule.code,
      polarity: pts > 0 ? "plus" : pts < 0 ? "minus" : "neutral",
      params: {
        goal: rule.goal,
        shoulderHip: p.shoulderHip.value.toFixed(2),
        waistHip: p.waistHip.value.toFixed(2),
        torsoLeg: p.torsoLeg ? p.torsoLeg.value.toFixed(2) : "?",
        heightCm: p.heightCm,
      },
    });
    if (pts < 0 && rule.rescue) {
      rescueKinds.push({ kind: typeof rule.rescue === "function" ? rule.rescue(c) : rule.rescue, from: rule.code });
    }
  }
  const hasMinus = evidence.some((e) => e.polarity === "minus");
  if (evidence.length === 0) evidence.push({ code: "no_strong_effect", polarity: "neutral" });
  const verdict =
    score >= 1.25 || (!hasMinus && score >= 0.5) ? "flatters" : score >= -0.75 ? "works_with_tweaks" : "not_flattering";

  return {
    verdict,
    score: Math.round(score * 100) / 100,
    confidence: minConfidence(p.confidence, g.confidence),
    evidence,
    rescueKinds,
  };
}
