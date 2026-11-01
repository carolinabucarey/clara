"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { applyLipstick, errorCode, tryOnBetterColor, type OutfitStep } from "@/lib/flow";
import { renderBeforeAfterCard } from "@/lib/share";
import { lipsticksFor } from "@/lib/verdict/palette";
import type { RescueKind } from "@/lib/types";
import type { Me, Trial } from "../ClaraApp";
import { Button, Card, ErrorNote, Note, ShadePicker, ShareButton, SkeletonImage, Swatch } from "../ui";
import { ZoomableImage } from "../ZoomableImage";

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

/** How to make one piece work: lipstick, better color, cut tips. Part of the look step. */
export function RescueSection({
  me,
  trial,
  look,
  onUpdate,
  autoRun,
}: {
  me: Me;
  trial: Trial;
  /**
   * The look the piece is worn in: its image ("your choice", missing while it is tried on)
   * and every piece in wear order, this one at `index`.
   */
  look: { url?: string; pieces: OutfitStep[]; index: number };
  onUpdate: (p: Partial<Trial>) => void;
  /** Apply the lipstick right away (only for the piece the person is looking at). */
  autoRun: boolean;
}) {
  const { t, rs } = useI18n();
  const result = trial.result!;
  const lip = result.rescues.find((r) => r.kind === "lipstick");
  const others = result.rescues.filter((r) => r.kind !== "lipstick");
  // Clara's lipstick first, then the others the person may want to try.
  const lipsticks = lip?.lipstick ? [lip.lipstick, ...lipsticksFor(me.profile).filter((s) => s.name !== lip.lipstick!.name)] : [];
  const shown = lipsticks.find((s) => s.name === trial.lipShade) ?? lip?.lipstick;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const [betterBusy, setBetterBusy] = useState(false);
  const [betterError, setBetterError] = useState<string | null>(null);
  // Keeps the side by side after picking another color over a try-on, waiting for the new one.
  const [betterCompared, setBetterCompared] = useState(false);
  // Recoloring needs the garment isolated by YouCam and a single main color.
  const canRecolor = !!trial.garment.isolatedUrl && trial.garment.attrs.pattern === "solid" && !trial.garment.multicolor;
  // Clara's color (the closest to the piece's) first, then the rest of the palette to try.
  const betterColors = result.betterColor ? [result.betterColor, ...result.palette.filter((c) => c !== result.betterColor)] : [];
  const betterShown = trial.betterPick ?? trial.betterHex ?? result.betterColor;
  // With other pieces, the comparison is the whole look: wait for its image to try the color over it.
  const multi = look.pieces.length > 1;
  const lookReady = !multi || !!look.url;
  // A recolor made over another version of the look (a piece added or removed since) no longer compares.
  const betterUrl = trial.betterLookUrl === look.url ? trial.betterUrl : undefined;
  const yoursUrl = look.url ?? (multi ? undefined : trial.garment.originalUrl);

  const runBetter = async () => {
    if (!betterShown || !lookReady) return;
    const lookUrl = look.url;
    setBetterBusy(true);
    setBetterError(null);
    try {
      // A piece alone goes over the image its own try-on was made over, or the body photo.
      const baseUrl = (multi ? lookUrl : trial.tryOnOverUrl) ?? null;
      const { url, garmentUrl } = await tryOnBetterColor(me.bodyBlob, trial.garment, betterShown, { baseUrl, pieces: look.pieces, index: look.index });
      onUpdate({ betterUrl: url, betterGarmentUrl: garmentUrl, betterHex: betterShown, betterLookUrl: lookUrl });
    } catch (e) {
      setBetterError(t(`errors.${errorCode(e)}`));
    } finally {
      setBetterBusy(false);
    }
  };

  // Like the lipstick, a new color waits for "Try it on me" so a stray tap doesn't spend a try-on.
  const pickBetter = (hex: string) => {
    if (hex === betterShown) return;
    if (betterUrl) setBetterCompared(true);
    setBetterError(null);
    onUpdate({
      betterPick: hex === result.betterColor ? undefined : hex,
      betterUrl: undefined,
      betterGarmentUrl: undefined,
      betterHex: undefined,
      betterLookUrl: undefined,
    });
  };

  const runLip = async () => {
    if (!shown) return;
    setBusy(true);
    setError(null);
    try {
      const { url, beforeUrl } = await applyLipstick(shown.hex, trial.tryOnUrl ?? null, me.selfieBlob);
      onUpdate({ lipUrl: url, lipBeforeUrl: beforeUrl });
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoRun || !lip || trial.lipUrl || started.current) return;
    started.current = true;
    void runLip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickLip = (name: string) => {
    if (name === shown?.name) return;
    setError(null);
    onUpdate({ lipShade: name === lip?.lipstick?.name ? undefined : name, lipUrl: undefined, lipBeforeUrl: undefined });
  };

  const lipName = shown ? t(`lipsticks.${shown.name}`) : "";
  const lipText = () =>
    shown === lip!.lipstick
      ? rs("lipstick", { ...lip!.params, name: lip!.lipstick!.name })
      : t("rescue.lipOther", { name: lipName, palette: t(`lipsticks.${lip!.lipstick!.name}`) });

  const shareLip = () =>
    renderBeforeAfterCard({
      before: { imageUrl: trial.lipBeforeUrl ?? me.selfieUrl, label: t("rescue.before") },
      after: { imageUrl: trial.lipUrl!, label: t("rescue.after"), hex: shown!.hex },
      text: lipText(),
      palette: result.palette,
      labels: { title: t("rescue.lipTitle", { name: lipName }), footer: t("privacy") },
    });

  const shareBetter = () =>
    renderBeforeAfterCard({
      before: { imageUrl: yoursUrl!, label: t("rescue.yours"), hex: trial.garment.color.hex },
      after: { imageUrl: betterUrl!, label: t("rescue.inYourColor"), hex: trial.betterHex ?? result.betterColor ?? undefined },
      text: t("rescue.betterBody"),
      palette: result.palette,
      labels: { title: t("rescue.betterTitle"), footer: t("privacy") },
    });

  return (
    <div className="space-y-4">
      {result.rescues.length === 0 && <Note>{t("rescue.nothing")}</Note>}

      {lip?.lipstick && shown && (
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <Swatch hex={shown.hex} size={32} />
            <h2 className="font-display text-xl text-ink">{t("rescue.lipTitle", { name: lipName })}</h2>
          </div>
          <p className="text-sm text-muted">{lipText()}</p>
          <ShadePicker
            shades={lipsticks.map((s) => ({ name: s.name, colors: [s.hex] }))}
            value={shown.name}
            onChange={pickLip}
            label={(name) => t(`lipsticks.${name}`)}
            disabled={busy}
          />
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
          {!trial.lipUrl && !busy && !error && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={runLip}>
                {t("rescue.lipTry")}
              </Button>
            </div>
          )}
          {trial.lipUrl && !busy && (
            <div className="flex flex-wrap justify-end gap-3">
              <ShareButton render={shareLip} filename="clara-lipstick.png" />
            </div>
          )}
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

      {result.betterColor && betterShown && (
        <Card className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex shrink-0 items-center">
              <Swatch hex={trial.garment.color.hex} size={40} />
              <span className="px-2 text-muted" aria-hidden>
                →
              </span>
              <Swatch hex={betterShown} size={40} />
            </div>
            <div>
              <h2 className="font-display text-lg text-ink">{t("rescue.betterTitle")}</h2>
              <p className="text-sm text-muted">{t("rescue.betterBody")}</p>
            </div>
          </div>
          <ShadePicker
            shades={betterColors.map((c) => ({ name: c, colors: [c] }))}
            value={betterShown}
            onChange={pickBetter}
            label={(c) => c.toUpperCase()}
            disabled={betterBusy}
            captions={{ own: t("rescue.betterClosest"), others: t("rescue.betterMore") }}
          />
          {(betterBusy || betterUrl || betterCompared) && (
            <div className="grid grid-cols-2 gap-3">
              <figure>
                {yoursUrl ? (
                  <ZoomableImage src={yoursUrl} className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
                ) : (
                  <SkeletonImage />
                )}
                <figcaption className="mt-1.5 text-center text-xs text-muted">{t("rescue.yours")}</figcaption>
              </figure>
              <figure>
                {betterUrl ? (
                  <ZoomableImage src={betterUrl} className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
                ) : (
                  <SkeletonImage label={betterBusy ? t("rescue.betterApplying") : undefined} />
                )}
                <figcaption className="mt-1.5 text-center text-xs text-muted">{t("rescue.inYourColor")}</figcaption>
              </figure>
            </div>
          )}
          {canRecolor && !betterUrl && !betterBusy && !betterError && (
            <div className="flex justify-end">
              <Button variant="secondary" onClick={runBetter} disabled={!lookReady}>
                {t("rescue.betterTry")}
              </Button>
            </div>
          )}
          {betterUrl && !betterBusy && (
            <div className="flex flex-wrap justify-end gap-3">
              <ShareButton render={shareBetter} filename="clara-in-your-color.png" />
            </div>
          )}
          {betterError && <ErrorNote onRetry={runBetter}>{betterError}</ErrorNote>}
        </Card>
      )}
    </div>
  );
}
