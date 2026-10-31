"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { errorCode, requestVerdict, tryOn } from "@/lib/flow";
import { buildVerdict } from "@/lib/verdict";
import { renderShareCard } from "@/lib/share";
import type { AxisVerdict, Goal, Verdict } from "@/lib/types";
import type { Me, Trial } from "../ClaraApp";
import { Button, Card, ConfidenceBadge, cx, ErrorNote, Note, SkeletonImage, Spinner, StepHeader, Swatch, VerdictPill } from "../ui";

function AxisCard({
  title,
  axis,
  headline,
  body,
  drafting,
}: {
  title: string;
  axis: AxisVerdict;
  headline?: string;
  body?: string;
  drafting: boolean;
}) {
  const { t, ev } = useI18n();
  const [open, setOpen] = useState(true);
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
        <VerdictPill verdict={axis.verdict} />
      </div>
      {drafting && !body ? (
        <div className="space-y-2">
          <div className="shimmer h-6 w-2/3 rounded-lg" />
          <div className="shimmer h-4 w-full rounded-lg" />
          <div className="shimmer h-4 w-5/6 rounded-lg" />
        </div>
      ) : (
        <div>
          {headline && <p className="font-display text-xl leading-snug text-ink">{headline}</p>}
          {body && <p className="mt-1 text-[15px] leading-relaxed text-ink/85">{body}</p>}
        </div>
      )}
      <div className="rounded-2xl bg-cream px-4 py-3">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {t("verdict.evidence")}
          <span aria-hidden>{open ? "−" : "+"}</span>
        </button>
        {open && (
          <ul className="mt-2 space-y-2">
            {axis.evidence.map((e, i) => (
              <li key={`${e.code}-${i}`} className="flex gap-2 text-sm leading-relaxed text-ink/80">
                <span
                  aria-hidden
                  className={cx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    e.polarity === "plus" && "bg-sage-soft text-sage",
                    e.polarity === "minus" && "bg-rose-soft text-rose",
                    e.polarity === "neutral" && "bg-sand text-muted",
                  )}
                >
                  {e.polarity === "plus" ? "+" : e.polarity === "minus" ? "−" : "·"}
                </span>
                {ev(e.code, e.params)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfidenceBadge level={axis.confidence} />
    </Card>
  );
}

export function VerdictStep({
  me,
  trial,
  goals,
  onUpdate,
  onRescue,
  onAnother,
  onCompare,
  onEditGarment,
}: {
  me: Me;
  trial: Trial;
  goals: Goal[];
  onUpdate: (patch: Partial<Trial>) => void;
  onRescue: () => void;
  onAnother: () => void;
  onCompare?: () => void;
  onEditGarment: () => void;
}) {
  const { t, locale, ev } = useI18n();
  const g = trial.garment;
  const [tryOnBusy, setTryOnBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const started = useRef<string | null>(null);

  const local = useMemo(
    () => buildVerdict({ profile: me.profile, proportions: me.proportions, garment: g.attrs, garmentColor: g.color, goals }),
    [me.profile, me.proportions, g.attrs, g.color, goals],
  );
  const result = trial.result ?? local;

  // Try-on: once per garment + body photo.
  const runTryOn = async () => {
    setTryOnBusy(true);
    onUpdate({ tryOnError: undefined });
    try {
      const url = await tryOn(me.bodyBlob, g.upload, g.attrs.category);
      onUpdate({ tryOnUrl: url });
    } catch (e) {
      onUpdate({ tryOnError: errorCode(e) });
    } finally {
      setTryOnBusy(false);
    }
  };
  const tryOnKey = `${g.id}:${me.bodyUrl}:${g.attrs.category}`;
  useEffect(() => {
    if (trial.tryOnUrl || trial.tryOnError || started.current === tryOnKey) return;
    started.current = tryOnKey;
    void runTryOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOnKey]);

  // Verdict text: whenever inputs or language change.
  const draftKey = JSON.stringify([locale, goals, me.profile, me.proportions, g.attrs, g.color.hex]);
  const lastDraft = useRef<string | null>(null);
  useEffect(() => {
    if (lastDraft.current === draftKey && trial.draft) return;
    lastDraft.current = draftKey;
    let cancelled = false;
     
    setDrafting(true);
    requestVerdict({
      locale,
      goals,
      profile: me.profile,
      proportions: me.proportions,
      garment: g.attrs,
      garmentColor: g.color,
    })
      .then(({ result, draft }) => {
        if (!cancelled) onUpdate({ result, draft, draftLocale: locale });
      })
      .catch(() => {
        if (!cancelled) onUpdate({ result: local });
      })
      .finally(() => {
        if (!cancelled) setDrafting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const draft = trial.draftLocale === locale ? trial.draft : undefined;
  const low = result.cut.confidence === "low" || result.color.confidence === "low";

  const save = async () => {
    setSharing(true);
    try {
      const levels = {
        flatters: t("verdict.levels.flatters"),
        works_with_tweaks: t("verdict.levels.works_with_tweaks"),
        not_flattering: t("verdict.levels.not_flattering"),
      } as Record<Verdict, string>;
      const blob = await renderShareCard({
        imageUrl: trial.tryOnUrl ?? g.originalUrl,
        result,
        draft,
        labels: { title: t("share.cardTitle"), cut: t("verdict.cut"), color: t("verdict.color"), levels, footer: t("privacy") },
        fallbackText: {
          cut: result.cut.evidence[0] ? ev(result.cut.evidence[0].code, result.cut.evidence[0].params) : "",
          color: result.color.evidence[0] ? ev(result.color.evidence[0].code, result.color.evidence[0].params) : "",
        },
      });
      const file = new File([blob], "clara-verdict.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Clara" }).catch(() => undefined);
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "clara-verdict.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="space-y-5">
      <StepHeader title={t("verdict.title")} />

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={me.bodyUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
            <figcaption className="mt-1.5 text-center text-xs text-muted">{t("verdict.you")}</figcaption>
          </figure>
          <figure>
            {trial.tryOnUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trial.tryOnUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
            ) : tryOnBusy || !trial.tryOnError ? (
              <SkeletonImage label={t("verdict.tryingOn")} />
            ) : (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-cream p-4 text-center">
                <p className="text-sm text-muted">{t("verdict.tryOnFailed")}</p>
                <p className="text-xs text-muted">{t(`errors.${trial.tryOnError}`)}</p>
                <Button variant="secondary" onClick={runTryOn}>
                  {t("common.retry")}
                </Button>
              </div>
            )}
            <figcaption className="mt-1.5 text-center text-xs text-muted">{t("verdict.withPiece")}</figcaption>
          </figure>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={g.isolatedUrl ?? g.originalUrl} alt="" className="h-12 w-12 rounded-xl object-contain" />
          <Swatch hex={g.color.hex} size={24} />
          <span className="flex-1 text-sm text-ink">
            {t(`attr.category.${g.attrs.category}`)} · {t(`colors.${g.color.name}`)}
          </span>
          <button onClick={onEditGarment} className="text-sm font-semibold text-clay underline-offset-4 hover:underline">
            {t("common.change")}
          </button>
        </div>
      </Card>

      {drafting && <Spinner label={t("verdict.drafting")} />}

      <AxisCard title={t("verdict.cut")} axis={result.cut} headline={draft?.cut.headline} body={draft?.cut.body} drafting={drafting} />
      <AxisCard title={t("verdict.color")} axis={result.color} headline={draft?.color.headline} body={draft?.color.body} drafting={drafting} />

      {draft?.uncertainty ? <Note>{draft.uncertainty}</Note> : low ? <Note>{t("verdict.lowConfidence")}</Note> : null}
      {draft?.source === "template" && <p className="text-xs text-muted">{t("verdict.templateNote")}</p>}
      {trial.tryOnError === "config" && <ErrorNote>{t("errors.config")}</ErrorNote>}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onAnother}>
          {t("verdict.another")}
        </Button>
        {onCompare && (
          <Button variant="secondary" onClick={onCompare}>
            {t("verdict.compare")}
          </Button>
        )}
        <Button variant="secondary" onClick={save} disabled={sharing}>
          {t("verdict.save")}
        </Button>
        <Button onClick={onRescue}>{t("verdict.rescue")}</Button>
      </div>
    </div>
  );
}
