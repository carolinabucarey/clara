"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { FACE_SHAPES, type BeautyPrefs, type Goal, type RatioRange } from "@/lib/types";
import type { Me } from "../ClaraApp";
import { Button, Card, ChipSelect, ConfidenceBadge, cx, StepHeader, Swatch } from "../ui";

const GOALS: Goal[] = ["elongate", "show_waist", "balance", "show_shoulders"];

function Row({ label, value, evidence, corrected }: { label: string; value: string; evidence: string; corrected?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right">
        <span className="block font-semibold capitalize text-ink">{value}</span>
        <span className="block text-xs text-muted">
          {evidence}
          {corrected && " · ✎"}
        </span>
      </span>
    </div>
  );
}

export function ProfileStep({
  me,
  goals,
  onGoals,
  beauty,
  onBeauty,
  onChange,
  onRetake,
  onDone,
}: {
  me: Me;
  goals: Goal[];
  onGoals: (g: Goal[]) => void;
  beauty: BeautyPrefs;
  onBeauty: (b: BeautyPrefs) => void;
  onChange: (patch: Partial<Me>) => void;
  onRetake: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [editColor, setEditColor] = useState(false);
  const [editBody, setEditBody] = useState(false);
  const [editFace, setEditFace] = useState(false);
  const face = me.faceShape;
  const { profile: p, proportions: b } = me;
  const ratio = (r: RatioRange | null) =>
    r ? t("profile.ratio", { value: r.value.toFixed(2), low: r.low.toFixed(2), high: r.high.toFixed(2) }) : t("profile.noRatio");
  const lines = b.lines;

  return (
    <div className="space-y-5">
      <StepHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-ink">{t("profile.color")}</h2>
          <ConfidenceBadge level={p.confidence} />
        </div>
        <div className="flex flex-wrap gap-5">
          <Swatch hex={p.skin.hex} label={t("profile.swatches.skin")} size={44} />
          {p.hair && <Swatch hex={p.hair.hex} label={t("profile.swatches.hair")} size={44} />}
          {p.eye && <Swatch hex={p.eye.hex} label={t("profile.swatches.eye")} size={44} />}
          {p.lip && <Swatch hex={p.lip.hex} label={t("profile.swatches.lip")} size={44} />}
        </div>
        <div>
          <Row
            label={t("profile.undertoneLabel")}
            value={t(`undertone.${p.undertone}`)}
            evidence={t("profile.evidence.undertone", { value: Math.round(p.skinHue) })}
            corrected={p.undertone !== me.measuredProfile.undertone}
          />
          <Row
            label={t("profile.depthLabel")}
            value={t(`depth.${p.depth}`)}
            evidence={t("profile.evidence.depth", { value: Math.round(p.ita) })}
            corrected={p.depth !== me.measuredProfile.depth}
          />
          <Row
            label={t("profile.contrastLabel")}
            value={t(`contrast.${p.contrast}`)}
            evidence={t("profile.evidence.contrast", { value: p.contrastDeltaL === null ? "?" : Math.round(p.contrastDeltaL) })}
            corrected={p.contrast !== me.measuredProfile.contrast}
          />
        </div>
        {p.issues.length > 0 && (
          <div className="rounded-2xl bg-amber-soft/60 px-4 py-3 text-sm text-ink">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber">{t("profile.issuesTitle")}</p>
            <ul className="list-disc space-y-0.5 pl-4 text-muted">
              {p.issues.map((i) => (
                <li key={i}>{t(`issues.${i}`)}</li>
              ))}
            </ul>
          </div>
        )}
        <button className="text-sm font-semibold text-clay underline-offset-4 hover:underline" onClick={() => setEditColor((v) => !v)}>
          {t("profile.correct")}
        </button>
        {editColor && (
          <div className="space-y-3">
            <ChipSelect
              label={t("profile.undertoneLabel")}
              value={p.undertone}
              options={(["warm", "neutral", "cool"] as const).map((v) => ({ value: v, label: t(`undertone.${v}`) }))}
              onChange={(v) => onChange({ profile: { ...p, undertone: v, corrected: true } })}
            />
            <ChipSelect
              label={t("profile.depthLabel")}
              value={p.depth}
              options={(["light", "medium", "deep"] as const).map((v) => ({ value: v, label: t(`depth.${v}`) }))}
              onChange={(v) => onChange({ profile: { ...p, depth: v, corrected: true } })}
            />
            <ChipSelect
              label={t("profile.contrastLabel")}
              value={p.contrast}
              options={(["low", "medium", "high"] as const).map((v) => ({ value: v, label: t(`contrast.${v}`) }))}
              onChange={(v) => onChange({ profile: { ...p, contrast: v, corrected: true } })}
            />
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl text-ink">{t("profile.proportions")}</h2>
          <ConfidenceBadge level={b.confidence} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr]">
          <figure className="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl bg-cream">
            <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={me.bodyUrl} alt="" className="block w-full" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
              {(["shoulder", "waist", "hip"] as const).map((k) => (
                <line
                  key={k}
                  x1={lines[k].x1}
                  x2={lines[k].x2}
                  y1={lines[k].y}
                  y2={lines[k].y}
                  stroke={k === "waist" ? "#a86d12" : "#a8492f"}
                  strokeWidth={0.012}
                  strokeLinecap="round"
                />
              ))}
            </svg>
            </div>
            <figcaption className="px-2 py-1.5 text-center text-[11px] text-muted">{t("profile.measuredOn")}</figcaption>
          </figure>
          <div>
            <Row label={t("profile.balanceLabel")} value={t(`balance.${b.balance}`)} evidence={ratio(b.shoulderHip)} corrected={b.balance !== me.measuredProportions.balance} />
            <Row label={t("profile.waistLabel")} value={t(`waist.${b.waist}`)} evidence={ratio(b.waistHip)} corrected={b.waist !== me.measuredProportions.waist} />
            <Row label={t("profile.torsoLabel")} value={t(`torso.${b.torso}`)} evidence={ratio(b.torsoLeg)} corrected={b.torso !== me.measuredProportions.torso} />
            <Row label={t("profile.heightLabel")} value={t(`height.${b.height}`)} evidence={`${b.heightCm} cm`} />
          </div>
        </div>
        {b.issues.length > 0 && (
          <div className="rounded-2xl bg-amber-soft/60 px-4 py-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber">{t("profile.issuesTitle")}</p>
            <ul className="list-disc space-y-0.5 pl-4 text-muted">
              {b.issues.map((i) => (
                <li key={i}>{t(`issues.${i}`)}</li>
              ))}
            </ul>
          </div>
        )}
        <button className="text-sm font-semibold text-clay underline-offset-4 hover:underline" onClick={() => setEditBody((v) => !v)}>
          {t("profile.correct")}
        </button>
        {editBody && (
          <div className="space-y-3">
            <ChipSelect
              label={t("profile.balanceLabel")}
              value={b.balance}
              options={(["shoulders_wider", "balanced", "hips_wider"] as const).map((v) => ({ value: v, label: t(`balance.${v}`) }))}
              onChange={(v) => onChange({ proportions: { ...b, balance: v, corrected: true } })}
            />
            <ChipSelect
              label={t("profile.waistLabel")}
              value={b.waist}
              options={(["defined", "moderate", "straight"] as const).map((v) => ({ value: v, label: t(`waist.${v}`) }))}
              onChange={(v) => onChange({ proportions: { ...b, waist: v, corrected: true } })}
            />
            <ChipSelect
              label={t("profile.torsoLabel")}
              value={b.torso}
              options={(["long_torso", "balanced", "long_legs"] as const).map((v) => ({ value: v, label: t(`torso.${v}`) }))}
              onChange={(v) => onChange({ proportions: { ...b, torso: v, corrected: true } })}
            />
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-display text-xl text-ink">{t("beauty.title")}</h2>
          <p className="text-sm text-muted">{t("beauty.subtitle")}</p>
        </div>
        {face ? (
          <Row
            label={t("beauty.faceShape")}
            value={t(`faceShapes.${face.shape}`)}
            evidence={face.aspect ? t("beauty.faceShapeEvidence", { value: face.aspect.toFixed(2) }) : ""}
            corrected={face.shape !== face.measured}
          />
        ) : (
          <p className="text-sm text-muted">{t("beauty.faceShapeUnknown")}</p>
        )}
        {face && (
          <button className="text-sm font-semibold text-clay underline-offset-4 hover:underline" onClick={() => setEditFace((v) => !v)}>
            {t("profile.correct")}
          </button>
        )}
        {(editFace || !face) && (
          <ChipSelect
            label={t("beauty.faceShape")}
            value={face?.shape ?? ("" as never)}
            options={FACE_SHAPES.map((v) => ({ value: v, label: t(`faceShapes.${v}`) }))}
            onChange={(shape) =>
              onChange({ faceShape: { shape, measured: face?.measured ?? shape, aspect: face?.aspect ?? null, corrected: true } })
            }
          />
        )}
        <ChipSelect
          label={t("beauty.makeupQuestion")}
          value={beauty.makeup === null ? ("" as never) : beauty.makeup ? "yes" : "no"}
          options={[
            { value: "yes" as const, label: t("beauty.yes") },
            { value: "no" as const, label: t("beauty.no") },
          ]}
          onChange={(v) => onBeauty({ ...beauty, makeup: v === "yes" })}
        />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">{t("goals.title")}</h2>
        <div className="flex flex-wrap gap-1.5">
          {GOALS.map((g) => {
            const on = goals.includes(g);
            return (
              <button
                key={g}
                aria-pressed={on}
                onClick={() => onGoals(on ? goals.filter((x) => x !== g) : [...goals, g])}
                className={cx(
                  "min-h-9 rounded-full border px-3 text-sm",
                  on ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink hover:border-ink/40",
                )}
              >
                {t(`goals.${g}`)}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onRetake}>
          {t("photos.newPhotos")}
        </Button>
        <Button onClick={onDone}>{t("profile.tryOn")}</Button>
      </div>
    </div>
  );
}
