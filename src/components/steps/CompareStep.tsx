"use client";

import { useI18n } from "@/lib/i18n/context";
import { COMPARE_CARD_MAX, renderCompareCard } from "@/lib/share";
import { slotFor, type Slot, type Verdict } from "@/lib/types";
import type { Trial } from "../ClaraApp";
import { Card, ShareButton, StepHeader, VerdictPill } from "../ui";

const SCORE = { flatters: 2, works_with_tweaks: 1, not_flattering: 0 } as const;

/** Trials with a verdict that fill `slot`: only alternatives to each other are worth comparing. */
export const comparable = (trials: Trial[], slot: Slot) =>
  trials.map((tr, i) => ({ tr, i })).filter(({ tr }) => tr.result && slotFor(tr.garment.attrs.category) === slot);

export function CompareStep({ trials, slot, onOpen }: { trials: Trial[]; slot: Slot; onOpen: (i: number) => void }) {
  const { t, locale } = useI18n();
  const scored = comparable(trials, slot).map(({ tr, i }) => ({
    tr,
    i,
    score: SCORE[tr.result!.cut.verdict] + SCORE[tr.result!.color.verdict] + (tr.result!.cut.score + tr.result!.color.score) / 100,
  }));
  const best = scored.reduce<number | null>((b, s) => (b === null || s.score > scored.find((x) => x.i === b)!.score ? s.i : b), null);

  // The card fits a few: the best scored, in the order they are shown here.
  const shareCard = () => {
    const shown = new Set([...scored].sort((a, b) => b.score - a.score).slice(0, COMPARE_CARD_MAX).map((s) => s.i));
    const levels = {
      flatters: t("verdict.levels.flatters"),
      works_with_tweaks: t("verdict.levels.works_with_tweaks"),
      not_flattering: t("verdict.levels.not_flattering"),
    } as Record<Verdict, string>;
    return renderCompareCard({
      items: scored
        .filter((s) => shown.has(s.i))
        .map(({ tr, i }) => ({
          imageUrl: tr.tryOnUrl ?? tr.garment.originalUrl,
          cut: tr.result!.cut.verdict,
          color: tr.result!.color.verdict,
          best: best === i,
        })),
      palette: scored.find((s) => s.i === best)?.tr.result!.palette ?? [],
      labels: { title: t("compare.title"), cut: t("verdict.cut"), color: t("verdict.color"), levels, best: t("compare.best"), footer: t("privacy") },
    });
  };

  return (
    <div className="space-y-5">
      <StepHeader title={t("compare.title")} subtitle={t(`compare.subtitle.${slot}`)} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {scored.map(({ tr, i }) => (
          <button key={tr.garment.id} onClick={() => onOpen(i)} className="text-left">
            <Card className={best === i ? "border-sage p-3 ring-2 ring-sage/40" : "p-3"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tr.tryOnUrl ?? tr.garment.originalUrl} alt="" className="aspect-[3/4] w-full rounded-xl bg-cream object-cover" />
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted">{t("verdict.cut")}</p>
                <VerdictPill verdict={tr.result!.cut.verdict} size="sm" />
                <p className="pt-1 text-xs text-muted">{t("verdict.color")}</p>
                <VerdictPill verdict={tr.result!.color.verdict} size="sm" />
                {best === i && <p className="pt-2 text-xs font-semibold text-sage">★ {t("compare.best")}</p>}
                {tr.draftLocale === locale && tr.draft && <p className="pt-1 text-xs text-ink/80">{tr.draft.cut.headline}</p>}
              </div>
            </Card>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <ShareButton render={shareCard} filename="clara-compare.png" />
      </div>
    </div>
  );
}
