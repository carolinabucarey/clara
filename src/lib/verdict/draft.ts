// Writes the verdict in natural language. Claude Opus 5.5 only rephrases the
// deterministic evidence it is given; a validator rejects any wording that talks
// about "flaws", and a template fallback guarantees an answer without the model.

import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CLAUDE_MODEL, claude, hasClaude } from "../claude/client";
import { evidenceText, rescueText, translate, type Locale } from "../i18n";
import type { AxisVerdict, Rescue, VerdictDraft, VerdictResult } from "../types";
import type { VerdictInput } from "./index";

export const DraftSchema = z.object({
  cut: z.object({ headline: z.string(), body: z.string() }),
  color: z.object({ headline: z.string(), body: z.string() }),
  rescue: z.object({ headline: z.string(), body: z.string() }).nullable(),
  uncertainty: z.string().nullable(),
});

// Words that judge bodies instead of describing goals, plus body-shape labels.
const BANNED: Record<Locale, RegExp[]> = {
  en: [
    /\bhid(e|es|ing)\b/i,
    /\bdisguis/i,
    /\bconceal/i,
    /\bcamouflag/i,
    /\bflaw/i,
    /\bproblem (area|zone)/i,
    /\bslimming\b/i,
    /\bthinner\b/i,
    /\bfat\b/i,
    /\bweight\b/i,
    /\bapple\b/i,
    /\bpear\b/i,
    /\bbanana\b/i,
    /\bhourglass\b/i,
    /\binverted triangle\b/i,
    /\bunflattering\b/i,
  ],
  es: [
    /disimul/i,
    /\bocult/i,
    /\bescond/i,
    /camufl/i,
    /defecto/i,
    /zona problem/i,
    /adelgaz/i,
    /\bgord/i,
    /\bflaca\b/i,
    /\bkilos?\b/i,
    /\bmanzana\b/i,
    /\bpera\b/i,
    /reloj de arena/i,
    /tri[aá]ngulo invertido/i,
  ],
};

export function violations(_locale: Locale, draft: z.infer<typeof DraftSchema>): string[] {
  const texts = [
    draft.cut.headline,
    draft.cut.body,
    draft.color.headline,
    draft.color.body,
    draft.rescue?.headline ?? "",
    draft.rescue?.body ?? "",
    draft.uncertainty ?? "",
  ];
  const found: string[] = [];
  for (const re of [...BANNED.en, ...BANNED.es]) {
    if (texts.some((t) => re.test(t))) found.push(re.source);
  }
  if (!draft.cut.body.trim() || !draft.color.body.trim()) found.push("empty");
  return found;
}

function axisTemplate(locale: Locale, axis: AxisVerdict) {
  const ranked = [...axis.evidence].sort((a, b) => {
    const want = axis.verdict === "flatters" ? "plus" : "minus";
    return (b.polarity === want ? 1 : 0) - (a.polarity === want ? 1 : 0);
  });
  return {
    headline: translate(locale, `verdict.levels.${axis.verdict}`),
    body: ranked
      .slice(0, 2)
      .map((e) => evidenceText(locale, e.code, e.params))
      .join(" "),
  };
}

function rescueParams(r: Rescue) {
  return { ...(r.params ?? {}), ...(r.lipstick ? { name: r.lipstick.name } : {}) };
}

export function templateDraft(locale: Locale, result: VerdictResult): VerdictDraft {
  const first = result.rescues[0];
  const low = result.cut.confidence === "low" || result.color.confidence === "low";
  return {
    cut: axisTemplate(locale, result.cut),
    color: axisTemplate(locale, result.color),
    rescue: first
      ? { headline: translate(locale, "verdict.rescue"), body: rescueText(locale, first.code, rescueParams(first)) }
      : null,
    uncertainty: low ? translate(locale, "verdict.lowConfidence") : null,
    source: "template",
  };
}

const SYSTEM = `You are Clara, an honest image advisor. A user is about to buy a garment she already chose and asks "how does this look on me?". You write her second opinion.

You receive JSON with the measured data and the verdict already decided by Clara's rules: for CUT and for COLOR, a fixed verdict label and a list of evidence sentences. Rephrase that evidence into a short, warm, frank opinion. Rules:
1. Show your work: mention the concrete evidence (measured numbers, colors, proportions) from the JSON. Never add facts, traits or measurements that are not in the JSON.
2. Keep the verdict labels exactly as decided; do not soften or contradict them.
3. Talk about goals and proportions (balance the silhouette, mark the waist, lengthen the line), never about defects. Never use words like hide, disguise, conceal, flaw, problem area, slimming, weight, or body-shape labels such as apple, pear or hourglass (nor their equivalents in other languages).
4. Admit what you do not know: if a confidence is "low" or "medium" or there are issues listed, say briefly what limits the reading in "uncertainty"; otherwise set it to null.
5. Rescue instead of forbid: if rescues are provided, "rescue" summarizes the most useful one or two in one sentence; if there are none, set it to null.
6. Write in the language given in "language", in neutral, natural phrasing, addressing the user as "you" (in Spanish, "tú").
Length: each headline at most 8 words; each body at most 2 sentences and 45 words.`;

export async function draftVerdict(locale: Locale, input: VerdictInput, result: VerdictResult): Promise<VerdictDraft> {
  if (!hasClaude()) return templateDraft(locale, result);

  const axis = (a: AxisVerdict) => ({
    verdict: a.verdict,
    confidence: a.confidence,
    evidence: a.evidence.map((e) => ({ polarity: e.polarity, text: evidenceText(locale, e.code, e.params) })),
  });
  const payload = {
    language: locale === "es" ? "Spanish (neutral)" : "English",
    garment: {
      type: input.garment.category,
      neckline: input.garment.neckline,
      length: input.garment.length,
      fit: input.garment.fit,
      main_color: { hex: input.garmentColor.hex, name: translate(locale, `colors.${input.garmentColor.name}`) },
    },
    measured_profile: {
      undertone: input.profile.undertone,
      depth: input.profile.depth,
      contrast: input.profile.contrast,
      confidence: input.profile.confidence,
      issues: input.profile.issues.map((i) => translate(locale, `issues.${i}`)),
    },
    measured_proportions: {
      balance: input.proportions.balance,
      waist: input.proportions.waist,
      torso_vs_legs: input.proportions.torso,
      height_cm: input.proportions.heightCm,
      confidence: input.proportions.confidence,
      issues: input.proportions.issues.map((i) => translate(locale, `issues.${i}`)),
    },
    goals: input.goals ?? [],
    cut: axis(result.cut),
    color: axis(result.color),
    rescues: result.rescues.map((r) => rescueText(locale, r.code, rescueParams(r))),
  };

  try {
    const res = await claude().beta.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(DraftSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return templateDraft(locale, result);
    const draft = res.parsed_output;
    const bad = violations(locale, draft);
    if (bad.length > 0) {
      console.warn("[verdict] draft rejected by validator:", bad);
      return templateDraft(locale, result);
    }
    return { ...draft, source: "claude" };
  } catch (err) {
    console.error("[verdict] Claude draft failed:", (err as Error).message);
    return templateDraft(locale, result);
  }
}
