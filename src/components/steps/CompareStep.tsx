"use client";

import { useI18n } from "@/lib/i18n/context";
import type { Trial } from "../ClaraApp";
import { Card, StepHeader, VerdictPill } from "../ui";

const SCORE = { flatters: 2, works_with_tweaks: 1, not_flattering: 0 } as const;

export function CompareStep({ trials, onOpen }: { trials: Trial[]; onOpen: (i: number) => void }) {
  const { t, locale } = useI18n();
  const scored = trials
    .map((tr, i) => ({ tr, i }))
    .filter(({ tr }) => tr.result)
    .map(({ tr, i }) => ({
      tr,
      i,
      score: SCORE[tr.result!.cut.verdict] + SCORE[tr.result!.color.verdict] + (tr.result!.cut.score + tr.result!.color.score) / 100,
    }));
  const best = scored.reduce<number | null>((b, s) => (b === null || s.score > scored.find((x) => x.i === b)!.score ? s.i : b), null);

  return (
    <div className="space-y-5">
      <StepHeader title={t("compare.title")} subtitle={t("compare.subtitle")} />
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
    </div>
  );
}
