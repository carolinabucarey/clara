"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { analyzeGarment, errorCode, type GarmentAnalysis } from "@/lib/flow";
import { describeGarmentColor } from "@/lib/color/garment";
import {
  FITS,
  GARMENT_CATEGORIES,
  LEGS,
  LENGTHS,
  NECKLINES,
  PATTERNS,
  RISES,
  SLEEVES,
  SLOT_CATEGORY,
  WAISTS,
  type GarmentAttributes,
  type Slot,
} from "@/lib/types";
import { Button, Card, ChipSelect, ErrorNote, FilePicker, Note, SkeletonImage, Spinner, StepHeader, Swatch } from "../ui";

interface DemoGarment {
  src: string;
  label: string;
}

const TOP_LENGTHS = ["cropped", "waist", "hip", "tunic"] as const;
const LONG_LENGTHS = ["mini", "knee", "midi", "maxi", "ankle", "full_length"] as const;

export function GarmentStep({
  initial,
  complement,
  onDone,
  onBack,
}: {
  initial?: GarmentAnalysis;
  /** Adding this slot to an existing look: the category is already known. */
  complement?: Slot;
  onDone: (g: GarmentAnalysis) => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(initial ?? null);
  const [attrs, setAttrs] = useState<GarmentAttributes | null>(initial?.attrs ?? null);
  const [colorHex, setColorHex] = useState<string | null>(initial?.color.hex ?? null);
  const [stage, setStage] = useState<"idle" | "reading" | "isolating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<Blob | null>(null);
  const [demos, setDemos] = useState<DemoGarment[]>([]);

  useEffect(() => {
    fetch("/demo/garments.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: DemoGarment[]) => setDemos(Array.isArray(list) ? list : []))
      .catch(() => setDemos([]));
  }, []);

  const run = async (file: Blob) => {
    setLastFile(file);
    setError(null);
    setAnalysis(null);
    setStage("reading");
    try {
      const read = await analyzeGarment(file, (s) => setStage(s));
      // The person said what this piece is: trust that over the automatic reading.
      const a = complement ? { ...read, attrs: { ...read.attrs, category: SLOT_CATEGORY[complement] } } : read;
      setAnalysis(a);
      setAttrs(a.attrs);
      setColorHex(a.color.hex);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    } finally {
      setStage("idle");
    }
  };

  const pickDemo = async (d: DemoGarment) => {
    const blob = await fetch(d.src).then((r) => r.blob());
    void run(blob);
  };

  const busy = stage !== "idle";
  const set = <K extends keyof GarmentAttributes>(k: K, v: GarmentAttributes[K]) =>
    setAttrs((a) => (a ? { ...a, [k]: v, uncertain: a.uncertain.filter((u) => u !== k) } : a));
  const opts = <T extends string>(group: string, values: readonly T[]) =>
    values.map((v) => ({ value: v, label: t(`attr.${group}.${v}`) }));

  const confirm = () => {
    if (!analysis || !attrs || !colorHex) return;
    const share = analysis.clusters.find((c) => c.hex === colorHex)?.share ?? 1;
    onDone({ ...analysis, attrs: { ...attrs, uncertain: [] }, color: describeGarmentColor(colorHex, share) });
  };

  const cat = attrs?.category;
  const isBottom = cat === "lower_body";
  const isTop = cat === "upper_body" || cat === "outer";

  return (
    <div className="space-y-5">
      <StepHeader
        title={complement ? t(`garment.complementTitle.${complement}`) : t("garment.title")}
        subtitle={complement ? t("garment.complementSubtitle") : t("garment.subtitle")}
      />

      {!analysis && !busy && (
        <Card className="flex flex-col items-center gap-4 border-dashed py-10 text-center">
          <div className="text-5xl" aria-hidden>
            👗
          </div>
          <FilePicker label={t("garment.upload")} onFile={run} />
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              {t("nav.back")}
            </Button>
          )}
          {demos.length > 0 && (
            <div className="w-full pt-2">
              <p className="mb-3 text-sm text-muted">{t("garment.demo")}</p>
              <div className="grid grid-cols-4 gap-2">
                {demos.map((d) => (
                  <button key={d.src} onClick={() => pickDemo(d)} className="overflow-hidden rounded-xl border border-line bg-cream">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.src} alt={d.label} className="aspect-[3/4] w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {busy && (
        <Card className="space-y-4">
          <SkeletonImage ratio="4/3" />
          <Spinner label={stage === "isolating" ? t("garment.isolating") : t("garment.reading")} />
        </Card>
      )}

      {error && <ErrorNote onRetry={lastFile ? () => run(lastFile) : undefined}>{error}</ErrorNote>}

      {analysis && attrs && (
        <>
          <Card className="space-y-4">
            <div className={analysis.isolatedUrl ? "grid grid-cols-2 gap-3" : "mx-auto max-w-[260px]"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={analysis.originalUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-contain" />
              {analysis.isolatedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={analysis.isolatedUrl} alt="" className="checker aspect-[3/4] w-full rounded-2xl object-contain" />
              )}
            </div>
            {!analysis.isGarment && <ErrorNote>{t("garment.notAGarment")}</ErrorNote>}
            <div>
              <h2 className="text-sm font-semibold text-ink">{t("garment.colorTitle")}</h2>
              <p className="mb-3 text-xs text-muted">{t("garment.colorHint")}</p>
              <div className="flex flex-wrap gap-4">
                {analysis.clusters.map((c) => (
                  <Swatch
                    key={c.hex}
                    hex={c.hex}
                    size={44}
                    label={`${Math.round(c.share * 100)}%`}
                    selected={c.hex === colorHex}
                    onClick={() => setColorHex(c.hex)}
                  />
                ))}
              </div>
              {analysis.multicolor && <p className="mt-3 text-xs text-muted">{t("garment.multicolor")}</p>}
            </div>
            <div className="flex justify-end">
              <FilePicker label={t("garment.replace")} onFile={run} variant="secondary" />
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="font-display text-xl text-ink">{t("garment.detected")}</h2>
              <p className="text-sm text-muted">{t("garment.detectedHint")}</p>
            </div>
            {analysis.attrsSource === "default" && <Note>{t("garment.readerUnavailable")}</Note>}
            <ChipSelect
              label={t("garment.attrs.category")}
              value={attrs.category}
              options={opts("category", GARMENT_CATEGORIES)}
              onChange={(v) => set("category", v)}
              uncertain={attrs.uncertain.includes("category")}
            />
            {!isBottom && (
              <ChipSelect
                label={t("garment.attrs.neckline")}
                value={attrs.neckline}
                options={opts("neckline", NECKLINES.filter((n) => n !== "none"))}
                onChange={(v) => set("neckline", v)}
                uncertain={attrs.uncertain.includes("neckline")}
              />
            )}
            {!isBottom && (
              <ChipSelect
                label={t("garment.attrs.sleeves")}
                value={attrs.sleeves}
                options={opts("sleeves", SLEEVES.filter((n) => n !== "none"))}
                onChange={(v) => set("sleeves", v)}
                uncertain={attrs.uncertain.includes("sleeves")}
              />
            )}
            <ChipSelect
              label={t("garment.attrs.length")}
              value={attrs.length}
              options={opts("length", isTop ? TOP_LENGTHS : isBottom ? LONG_LENGTHS : LENGTHS.filter((l) => l !== "tunic"))}
              onChange={(v) => set("length", v)}
              uncertain={attrs.uncertain.includes("length")}
            />
            <ChipSelect
              label={t("garment.attrs.fit")}
              value={attrs.fit}
              options={opts("fit", FITS)}
              onChange={(v) => set("fit", v)}
              uncertain={attrs.uncertain.includes("fit")}
            />
            {!isBottom && (
              <ChipSelect
                label={t("garment.attrs.waist")}
                value={attrs.waist}
                options={opts("waist", WAISTS.filter((w) => w !== "high_waisted"))}
                onChange={(v) => set("waist", v)}
                uncertain={attrs.uncertain.includes("waist")}
              />
            )}
            {isBottom && (
              <ChipSelect
                label={t("garment.attrs.rise")}
                value={attrs.rise}
                options={opts("rise", RISES.filter((r) => r !== "na"))}
                onChange={(v) => set("rise", v)}
                uncertain={attrs.uncertain.includes("rise")}
              />
            )}
            {isBottom && (
              <ChipSelect
                label={t("garment.attrs.leg")}
                value={attrs.leg}
                options={opts("leg", LEGS)}
                onChange={(v) => set("leg", v)}
                uncertain={attrs.uncertain.includes("leg")}
              />
            )}
            <ChipSelect
              label={t("garment.attrs.pattern")}
              value={attrs.pattern}
              options={opts("pattern", PATTERNS)}
              onChange={(v) => set("pattern", v)}
              uncertain={attrs.uncertain.includes("pattern")}
            />
          </Card>

          <div className="flex justify-end">
            <Button onClick={confirm} disabled={!analysis.isGarment && analysis.attrsSource === "claude"}>
              {t("garment.confirm")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
