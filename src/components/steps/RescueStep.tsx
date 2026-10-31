"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { applyLipstick, errorCode, tryOnBetterColor } from "@/lib/flow";
import type { RescueKind } from "@/lib/types";
import type { Me, Trial } from "../ClaraApp";
import { Button, Card, ErrorNote, Note, SkeletonImage, StepHeader, Swatch } from "../ui";

const ICONS: Record<RescueKind, string> = {
  lipstick: "💄",
  color_near_face: "🧣",
  metal: "✨",
  belt: "➰",
  tuck: "👚",
  layer: "🧥",
  shoes: "👠",
  sleeves: "💪",
  longer_top: "👕",
  untuck: "👕",
};

export function RescueStep({ me, trial, onUpdate, onBack }: { me: Me; trial: Trial; onUpdate: (p: Partial<Trial>) => void; onBack: () => void }) {
  const { t, rs } = useI18n();
  const result = trial.result!;
  const lip = result.rescues.find((r) => r.kind === "lipstick");
  const others = result.rescues.filter((r) => r.kind !== "lipstick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const [betterBusy, setBetterBusy] = useState(false);
  const [betterError, setBetterError] = useState<string | null>(null);
  // Recoloring needs the garment isolated by YouCam and a single main color.
  const canRecolor = !!trial.garment.isolatedUrl && trial.garment.attrs.pattern === "solid" && !trial.garment.multicolor;

  const runBetter = async () => {
    if (!result.betterColor) return;
    setBetterBusy(true);
    setBetterError(null);
    try {
      const { url, garmentUrl } = await tryOnBetterColor(me.bodyBlob, trial.garment, result.betterColor);
      onUpdate({ betterUrl: url, betterGarmentUrl: garmentUrl, betterHex: result.betterColor });
    } catch (e) {
      setBetterError(t(`errors.${errorCode(e)}`));
    } finally {
      setBetterBusy(false);
    }
  };

  const runLip = async () => {
    if (!lip?.lipstick) return;
    setBusy(true);
    setError(null);
    try {
      const { url, beforeUrl } = await applyLipstick(lip.lipstick.hex, trial.tryOnUrl ?? null, me.selfieBlob);
      onUpdate({ lipUrl: url, lipBeforeUrl: beforeUrl });
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!lip || trial.lipUrl || started.current) return;
    started.current = true;
    void runLip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lipName = lip?.lipstick ? t(`lipsticks.${lip.lipstick.name}`) : "";

  return (
    <div className="space-y-5">
      <StepHeader title={t("rescue.title")} subtitle={t("rescue.subtitle")} />

      {result.rescues.length === 0 && <Note>{t("rescue.nothing")}</Note>}

      {lip?.lipstick && (
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <Swatch hex={lip.lipstick.hex} size={32} />
            <h2 className="font-display text-xl text-ink">{t("rescue.lipTitle", { name: lipName })}</h2>
          </div>
          <p className="text-sm text-muted">{rs("lipstick", { ...lip.params, name: lip.lipstick.name })}</p>
          <div className="grid grid-cols-2 gap-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={trial.lipBeforeUrl ?? me.selfieUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
              <figcaption className="mt-1.5 text-center text-xs text-muted">{t("rescue.before")}</figcaption>
            </figure>
            <figure>
              {trial.lipUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={trial.lipUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
              ) : (
                <SkeletonImage label={busy ? t("rescue.lipApplying") : undefined} />
              )}
              <figcaption className="mt-1.5 text-center text-xs text-muted">{t("rescue.after")}</figcaption>
            </figure>
          </div>
          {error && <ErrorNote onRetry={runLip}>{error}</ErrorNote>}
        </Card>
      )}

      {others.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {others.map((r) => (
              <li key={r.code} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-2xl" aria-hidden>
                  {ICONS[r.kind]}
                </span>
                <div className="space-y-2">
                  <p className="text-[15px] leading-relaxed text-ink">{rs(r.code, r.params)}</p>
                  {r.swatches && (
                    <div className="flex flex-wrap gap-3">
                      {r.swatches.map((s) => (
                        <Swatch key={s} hex={s} size={28} />
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {result.betterColor && (
        <Card className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex shrink-0 items-center">
              <Swatch hex={trial.garment.color.hex} size={40} />
              <span className="px-2 text-muted" aria-hidden>
                →
              </span>
              <Swatch hex={result.betterColor} size={40} />
            </div>
            <div>
              <h2 className="font-display text-lg text-ink">{t("rescue.betterTitle")}</h2>
              <p className="text-sm text-muted">{t("rescue.betterBody")}</p>
            </div>
          </div>
          {canRecolor && !trial.betterUrl && !betterBusy && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={runBetter}>
                {t("rescue.betterTry")}
              </Button>
            </div>
          )}
          {(betterBusy || trial.betterUrl) && (
            <div className="grid grid-cols-2 gap-3">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={trial.tryOnUrl ?? trial.garment.originalUrl}
                  alt=""
                  className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover"
                />
                <figcaption className="mt-1.5 text-center text-xs text-muted">{t("rescue.yours")}</figcaption>
              </figure>
              <figure>
                {trial.betterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={trial.betterUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
                ) : (
                  <SkeletonImage label={t("rescue.betterApplying")} />
                )}
                <figcaption className="mt-1.5 text-center text-xs text-muted">{t("rescue.inYourColor")}</figcaption>
              </figure>
            </div>
          )}
          {betterError && <ErrorNote onRetry={runBetter}>{betterError}</ErrorNote>}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-display text-lg text-ink">{t("rescue.paletteTitle")}</h2>
        <div className="flex flex-wrap gap-4">
          {result.palette.map((s) => (
            <Swatch key={s} hex={s} size={40} />
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onBack}>
          {t("nav.back")}
        </Button>
      </div>
    </div>
  );
}
