"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";
import { checkTryOnFidelity, errorCode, tryOnOutfit } from "@/lib/flow";
import { fullLookUrl, missingSlots, outfitKey, outfitPlan, wearOrder } from "@/lib/look";
import { renderLookCard } from "@/lib/share";
import { evaluateOutfit, suggestComplement, type OutfitPieces } from "@/lib/verdict/outfit";
import type { BeautyPrefs, Goal, Slot } from "@/lib/types";
import type { Look, Me, Trial } from "../ClaraApp";
import { BeautySection } from "./BeautySection";
import { RescueSection } from "./RescueSection";
import {
  Button,
  Card,
  ConfidenceBadge,
  EvidenceList,
  Note,
  OutfitPill,
  ShareButton,
  SkeletonImage,
  StepHeader,
  Swatch,
  VerdictPill,
} from "../ui";

/** Pieces nearest the face first: the makeup plays along with those colors. */
const FACE_FIRST: Slot[] = ["top", "full", "outer", "bottom"];

export function LookStep({
  me,
  trials,
  look,
  current,
  goals,
  beauty,
  onBeauty,
  onUpdateLook,
  onUpdateTrial,
  onAddPiece,
  onOpenPiece,
  onRemovePiece,
  onAnother,
  actions,
}: {
  me: Me;
  trials: Trial[];
  look: Look;
  current: number;
  goals: Goal[];
  beauty: BeautyPrefs;
  onBeauty: (b: BeautyPrefs) => void;
  onUpdateLook: (patch: Partial<Look>) => void;
  onUpdateTrial: (patch: Partial<Trial>, index: number) => void;
  onAddPiece: (slot: Slot) => void;
  onOpenPiece: (index: number) => void;
  onRemovePiece: (slot: Slot) => void;
  onAnother: () => void;
  /** Extra buttons for the footer (save, share). */
  actions?: ReactNode;
}) {
  const { t, ev, rs } = useI18n();
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);

  const order = wearOrder(look.pieces);
  const pieceOf = (s: Slot) => trials[look.pieces[s]!];
  const multi = order.length > 1;
  const key = outfitKey(look.pieces, trials, me.bodyUrl);
  const outfitUrl = multi ? (look.outfitKey === key ? look.outfitUrl : undefined) : pieceOf(order[0]).tryOnUrl;
  const outfitError = multi ? (look.outfitKey === key ? look.outfitError : undefined) : pieceOf(order[0]).tryOnError;

  const runOutfit = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setBusy(true);
    onUpdateLook({ outfitError: undefined });
    try {
      const plan = outfitPlan(look.pieces, trials);
      const step = (s: Slot) => ({ garment: pieceOf(s).garment.upload, category: pieceOf(s).garment.attrs.category });
      const url = await tryOnOutfit(me.bodyBlob, plan.baseUrl, plan.steps.map(step), signal, order.map(step));
      if (signal.aborted) return;
      onUpdateLook({ outfitUrl: url, outfitKey: key, outfitFidelityWarning: undefined });
      checkTryOnFidelity(me.bodyUrl, url)
        .then((issues) => { if (!signal.aborted) onUpdateLook({ outfitFidelityWarning: issues.length > 0 }); })
        .catch(() => undefined);
    } catch (e) {
      if (!signal.aborted) onUpdateLook({ outfitError: errorCode(e), outfitKey: key, outfitUrl: undefined });
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  // The outfit is tried on once per combination of pieces and body photo.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (multi && look.outfitKey !== key) void runOutfit();
    }, 0);
    return () => { clearTimeout(timer); request.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, multi]);

  const pieces: OutfitPieces = Object.fromEntries(
    order.map((s) => [s, { attrs: pieceOf(s).garment.attrs, color: pieceOf(s).garment.color }]),
  );
  const outfit = evaluateOutfit(pieces, me.proportions, goals);
  const suggestion = suggestComplement(me.profile, me.proportions, goals, pieces);
  const extraSlots = missingSlots(look.pieces).filter((s) => s !== suggestion?.slot);
  const outfitHexes = useMemo(
    () => FACE_FIRST.filter((s) => look.pieces[s] !== undefined).map((s) => trials[look.pieces[s]!].garment.color.hex),
    [look.pieces, trials],
  );
  const palette = trials[current]?.result?.palette ?? [];
  const fullUrl = fullLookUrl(look, outfitUrl);

  const shareCard = () =>
    renderLookCard({
      imageUrl: fullUrl ?? outfitUrl!,
      portraitUrl: look.faceUrl,
      pieces: order.map((s) => {
        const g = pieceOf(s).garment;
        return { imageUrl: g.isolatedUrl ?? g.originalUrl, hex: g.color.hex, label: `${t(`attr.category.${g.attrs.category}`)} · ${t(`colors.${g.color.name}`)}` };
      }),
      outfit: outfit ? { verdict: outfit.verdict, label: t(`look.levels.${outfit.verdict}`) } : undefined,
      palette,
      labels: { title: t("look.title"), footer: t("privacy") },
    });

  return (
    <div className="space-y-5">
      <StepHeader title={t("look.title")} subtitle={t("look.subtitle")} />
      {look.saved && <Note>{t("looks.editing")}</Note>}

      <Card className="space-y-4">
        <h2 className="font-display text-xl text-ink">{t("look.outfit")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <figure>
            {outfitUrl && !busy ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={outfitUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
            ) : outfitError ? (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-2xl bg-cream p-4 text-center">
                <p className="text-sm text-muted">{t("look.tryOnFailed")}</p>
                <p className="text-xs text-muted">{t(`errors.${outfitError}`)}</p>
                <Button variant="secondary" onClick={multi ? runOutfit : () => onOpenPiece(look.pieces[order[0]]!)}>
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <SkeletonImage label={multi ? t("look.tryingOn") : t("verdict.tryingOn")} />
            )}
          </figure>
          <ul className="space-y-2">
            {order.map((s) => {
              const index = look.pieces[s]!;
              const tr = trials[index];
              const g = tr.garment;
              return (
                <li key={s} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.isolatedUrl ?? g.originalUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex items-center gap-2 text-sm text-ink">
                      <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: g.color.hex }} aria-hidden />
                      <span className="truncate">
                        {t(`attr.category.${g.attrs.category}`)} · {t(`colors.${g.color.name}`)}
                      </span>
                    </p>
                    {tr.result && (
                      <div className="flex flex-wrap gap-1">
                        <VerdictPill verdict={tr.result.cut.verdict} size="sm" />
                        <VerdictPill verdict={tr.result.color.verdict} size="sm" />
                      </div>
                    )}
                    <div className="flex gap-3 text-xs font-semibold">
                      <button className="text-clay underline-offset-4 hover:underline" onClick={() => onOpenPiece(index)}>
                        {t("verdict.title")}
                      </button>
                      {g.source && (
                        <a href={g.source.url} target="_blank" rel="noopener noreferrer" className="text-clay underline-offset-4 hover:underline">
                          {t("look.store")}
                        </a>
                      )}
                      {multi && (
                        <button className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => onRemovePiece(s)}>
                          {t("look.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {multi && look.outfitFidelityWarning && outfitUrl && <Note>{t("verdict.fidelityWarning")}</Note>}
        {!multi && <Note>{t("look.onePiece")}</Note>}

        {outfit && (
          <div className="space-y-3 rounded-2xl bg-cream px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t("look.together")}</h3>
              <OutfitPill verdict={outfit.verdict} />
            </div>
            <EvidenceList items={outfit.evidence} render={(e) => ev(e.code, e.params)} />
            {outfit.tweaks.length > 0 && (
              <div className="space-y-1.5 border-t border-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("look.tweaksTitle")}</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink/85">
                  {outfit.tweaks.map((c) => (
                    <li key={c}>{rs(c)}</li>
                  ))}
                </ul>
              </div>
            )}
            <ConfidenceBadge level={outfit.confidence} />
          </div>
        )}

        {suggestion && (
          <div className="space-y-3 rounded-2xl border border-dashed border-line px-4 py-3">
            <h3 className="font-display text-lg text-ink">{t(`look.completeTitle.${suggestion.slot}`)}</h3>
            <p className="text-sm text-muted">{t("look.completeBody")}</p>
            <div className="flex flex-wrap gap-3">
              {suggestion.colors.map((c) => (
                <Swatch key={c} hex={c} size={32} />
              ))}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink/85">
              {suggestion.tips.map((tip) => (
                <li key={tip}>{t(`look.tips.${tip}`)}</li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button onClick={() => onAddPiece(suggestion.slot)}>{t(`look.add.${suggestion.slot}`)}</Button>
            </div>
          </div>
        )}

        {extraSlots.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {extraSlots.map((s) => (
              <Button key={s} variant="secondary" onClick={() => onAddPiece(s)}>
                {t(`look.add.${s}`)}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <BeautySection
        me={me}
        look={look}
        beauty={beauty}
        onBeauty={onBeauty}
        outfitHexes={outfitHexes}
        outfitUrl={outfitUrl}
        onUpdateLook={onUpdateLook}
      />

      <Card className="space-y-4">
        <h2 className="font-display text-xl text-ink">{t("look.rescueTitle")}</h2>
        {order
          .map((s) => look.pieces[s]!)
          .filter((i) => trials[i].result)
          .map((i) => (
            <div key={i} className="space-y-3">
              {multi && (
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={trials[i].garment.isolatedUrl ?? trials[i].garment.originalUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
                  {t(`attr.category.${trials[i].garment.attrs.category}`)} · {t(`colors.${trials[i].garment.color.name}`)}
                </div>
              )}
              <RescueSection me={me} trial={trials[i]} onUpdate={(patch) => onUpdateTrial(patch, i)} autoRun={i === current} />
            </div>
          ))}
      </Card>

      {palette.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-display text-lg text-ink">{t("rescue.paletteTitle")}</h2>
          <div className="flex flex-wrap gap-4">
            {palette.map((s) => (
              <Swatch key={s} hex={s} size={40} />
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onAnother}>
          {t("look.another")}
        </Button>
        {outfitUrl && !busy && <ShareButton render={shareCard} filename="clara-look.png" />}
        {actions}
      </div>
    </div>
  );
}
