"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { applyHairstyle, applyLookOnBody, applyMakeupLook, errorCode } from "@/lib/flow";
import { makeupEffects, makeupFor } from "@/lib/beauty/makeup";
import { judgeHairstyle, suggestHairstyles, templatesFor } from "@/lib/beauty/hairstyles";
import { useHairTemplates } from "@/lib/beauty/templates";
import type { BeautyPrefs, HairStyleGroup } from "@/lib/types";
import type { Look, Me } from "../ClaraApp";
import { Button, Card, ChipSelect, cx, ErrorNote, EvidenceList, Note, SkeletonImage, Spinner, VerdictPill } from "../ui";
import { ZoomableImage } from "../ZoomableImage";

function HairTile({
  label,
  note,
  thumb,
  selected,
  onClick,
}: {
  label: string;
  note?: string;
  thumb: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="text-left">
      <span
        className={cx(
          "block aspect-square w-full overflow-hidden rounded-2xl bg-cream",
          selected ? "ring-2 ring-ink ring-offset-2" : "border border-line",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="mt-1 block truncate text-xs text-ink">{label}</span>
      {note && <span className="block truncate text-[11px] text-muted">{note}</span>}
    </button>
  );
}

/** Hair and makeup that finish the look: Clara's picks, why, and a before/after portrait. */
export function BeautySection({
  me,
  look,
  beauty,
  onBeauty,
  outfitHexes,
  outfitUrl,
  onUpdateLook,
}: {
  me: Me;
  look: Look;
  beauty: BeautyPrefs;
  onBeauty: (b: BeautyPrefs) => void;
  /** The outfit try-on, to put the whole look on the full-body photo. */
  outfitUrl?: string;
  /** Colors of the pieces nearest the face first, for the makeup to play along with. */
  outfitHexes: string[];
  onUpdateLook: (patch: Partial<Look>) => void;
}) {
  const { t, tl } = useI18n();
  const { templates, failed } = useHairTemplates();
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullBusy, setFullBusy] = useState(false);
  const faceShape = me.faceShape?.shape ?? null;

  const suggestions = useMemo(
    () => (templates ? suggestHairstyles(templates, faceShape, beauty.hair) : []),
    [templates, faceShape, beauty.hair],
  );
  const catalog = useMemo(() => (templates ? templatesFor(templates, beauty.hair) : []), [templates, beauty.hair]);
  const chosen = look.hairTemplateId === undefined ? (suggestions[0]?.templateId ?? null) : look.hairTemplateId;
  const chosenSuggestion = suggestions.find((s) => s.templateId === chosen);
  const chosenTemplate = templates?.find((x) => x.id === chosen);
  const hairFit = chosenTemplate && faceShape ? judgeHairstyle(chosenTemplate, faceShape) : null;
  const titleOf = (id: string) => templates?.find((x) => x.id === id)?.title ?? "";

  const steps = useMemo(
    () => (beauty.makeup ? makeupFor(me.profile, faceShape, outfitHexes) : []),
    [beauty.makeup, me.profile, faceShape, outfitHexes],
  );
  const kept = steps.filter((s) => !look.makeupOff?.includes(s.category));
  const effects = makeupEffects(kept);

  // Your own hair color, unless the cut you picked brings its own on purpose.
  const ownColor = !chosenTemplate?.changesColor;
  const hairSpec = chosen ? `${chosen}|${ownColor ? "own-color" : "template-color"}` : "";
  const hairKey = chosen ? `${me.selfieWideUrl}|${hairSpec}` : null;
  const faceKey = `${me.selfieWideUrl}|${hairSpec}|${JSON.stringify(effects)}`;
  const faceUrl = look.faceKey === faceKey ? look.faceUrl : undefined;
  const faceError = look.faceKey === faceKey ? look.faceError : undefined;
  const stale = !!look.faceUrl && look.faceKey !== faceKey;
  const canTry = !!chosen || effects.length > 0;
  // The full-body photo only gets the makeup: the haircut stays on the portrait.
  const fullKey = outfitUrl && effects.length > 0 ? `${outfitUrl}|${JSON.stringify(effects)}` : null;
  const fullUrl = fullKey && look.fullKey === fullKey ? look.fullUrl : undefined;
  const fullError = fullKey && look.fullKey === fullKey ? look.fullError : undefined;
  const used = () => ({
    faceMakeup: kept,
    faceHair: chosen ? { templateId: chosen, title: titleOf(chosen), code: chosenSuggestion?.code, params: chosenSuggestion?.params } : null,
  });

  const run = async () => {
    setBusy(true);
    onUpdateLook({ faceUrl: undefined, faceError: undefined, faceKey });
    try {
      let hairUrl = hairKey && look.hairKey === hairKey ? look.hairUrl : undefined;
      if (chosen && !hairUrl) {
        hairUrl = await applyHairstyle(me.selfieWideBlob, chosen, ownColor);
        onUpdateLook({ hairUrl, hairKey: hairKey! });
      }
      const url = effects.length > 0 ? await applyMakeupLook(effects, chosen ? hairUrl! : null, me.selfieWideBlob) : hairUrl!;
      onUpdateLook({ faceUrl: url, faceKey, ...used() });
    } catch (e) {
      onUpdateLook({ faceError: errorCode(e), faceKey });
    } finally {
      setBusy(false);
    }
  };

  const runFull = async () => {
    if (!outfitUrl || !fullKey) return;
    setFullBusy(true);
    onUpdateLook({ fullUrl: undefined, fullError: undefined, fullKey });
    try {
      const url = await applyLookOnBody(outfitUrl, effects);
      onUpdateLook({ fullUrl: url, fullKey, faceMakeup: kept });
    } catch (e) {
      onUpdateLook({ fullError: errorCode(e), fullKey });
    } finally {
      setFullBusy(false);
    }
  };

  const toggleStep = (category: (typeof steps)[number]["category"]) => {
    const off = look.makeupOff ?? [];
    onUpdateLook({ makeupOff: off.includes(category) ? off.filter((c) => c !== category) : [...off, category] });
  };

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-display text-xl text-ink">{t("beauty.title")}</h2>
        <p className="text-sm text-muted">{t("beauty.subtitle")}</p>
      </div>

      {/* Hair */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{t("beauty.hairTitle")}</h3>
          {faceShape && (
            <span className="text-xs text-muted">
              {t("beauty.faceShape")}: {t(`faceShapes.${faceShape}`)}
            </span>
          )}
        </div>
        <ChipSelect<HairStyleGroup>
          label={t("beauty.hairQuestion")}
          value={beauty.hair}
          options={(["feminine", "masculine", "all"] as const).map((v) => ({ value: v, label: t(`beauty.hairGroups.${v}`) }))}
          onChange={(hair) => {
            onBeauty({ ...beauty, hair });
            onUpdateLook({ hairTemplateId: undefined });
          }}
        />
        {!templates && !failed && <Spinner label={t("beauty.hairLoading")} />}
        {failed && <Note>{t("beauty.hairUnavailable")}</Note>}
        {templates && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <HairTile
                label={t("beauty.keepHair")}
                thumb={me.selfieWideUrl}
                selected={chosen === null}
                onClick={() => onUpdateLook({ hairTemplateId: null })}
              />
              {suggestions.map((s) => (
                <HairTile
                  key={s.templateId}
                  label={s.title}
                  thumb={s.thumb}
                  selected={chosen === s.templateId}
                  onClick={() => onUpdateLook({ hairTemplateId: s.templateId })}
                />
              ))}
            </div>
            {chosenTemplate && (
              <div className="space-y-2 rounded-2xl bg-cream px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{chosenTemplate.title}</span>
                  {hairFit && <VerdictPill verdict={hairFit.verdict} size="sm" />}
                </div>
                {hairFit ? (
                  <EvidenceList items={hairFit.evidence} render={(e) => tl(`beauty.hairWhy.${e.code}`, e.params)} />
                ) : (
                  <p className="text-sm text-muted">{t("beauty.fitNoShape")}</p>
                )}
                {chosenTemplate.changesColor && <p className="text-xs text-muted">{t("beauty.colorNote")}</p>}
              </div>
            )}
            {catalog.length > suggestions.length && (
              <button className="text-sm font-semibold text-clay underline-offset-4 hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? t("beauty.lessHair") : t("beauty.moreHair")}
              </button>
            )}
            {showAll && (
              <div className="grid max-h-80 grid-cols-4 gap-3 overflow-y-auto pr-1 sm:grid-cols-5">
                {catalog
                  .filter((c) => !suggestions.some((s) => s.templateId === c.id))
                  .map((c) => (
                    <HairTile
                      key={c.id}
                      label={c.title}
                      note={c.changesColor ? t("beauty.changesColor") : undefined}
                      thumb={c.thumb}
                      selected={chosen === c.id}
                      onClick={() => onUpdateLook({ hairTemplateId: c.id })}
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Makeup */}
      <div className="space-y-3 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">{t("beauty.makeupTitle")}</h3>
        {beauty.makeup === null && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream px-4 py-3">
            <span className="flex-1 text-sm text-ink">{t("beauty.makeupQuestion")}</span>
            <Button variant="secondary" onClick={() => onBeauty({ ...beauty, makeup: false })}>
              {t("beauty.no")}
            </Button>
            <Button onClick={() => onBeauty({ ...beauty, makeup: true })}>{t("beauty.yes")}</Button>
          </div>
        )}
        {beauty.makeup === false && (
          <p className="text-sm text-muted">
            {t("beauty.noMakeup")}{" "}
            <button className="font-semibold text-clay underline-offset-4 hover:underline" onClick={() => onBeauty({ ...beauty, makeup: true })}>
              {t("common.change")}
            </button>
          </p>
        )}
        {beauty.makeup && (
          <ul className="divide-y divide-line">
            {steps.map((s) => {
              const on = !look.makeupOff?.includes(s.category);
              return (
                <li key={s.category} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex shrink-0 gap-1 pt-0.5">
                    {s.colors.map((c) => (
                      <span key={c} className="block h-6 w-6 rounded-full border border-black/10" style={{ background: c }} aria-hidden />
                    ))}
                  </span>
                  <div className={cx("flex-1", !on && "opacity-50")}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t(`beauty.categories.${s.category}`)}</p>
                    <p className="text-sm leading-relaxed text-ink">{tl(`beauty.why.${s.code}`, s.params)}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleStep(s.category)}
                    aria-label={t(`beauty.categories.${s.category}`)}
                    className="mt-1 h-5 w-5 accent-[var(--clay)]"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Before / after */}
      <div className="space-y-3 border-t border-line pt-4">
        {(busy || faceUrl) && (
          <div className="grid grid-cols-2 gap-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={me.selfieWideUrl} alt="" className="aspect-[4/5] w-full rounded-2xl bg-cream object-cover" />
              <figcaption className="mt-1.5 text-center text-xs text-muted">{t("beauty.before")}</figcaption>
            </figure>
            <figure>
              {faceUrl && !busy ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={faceUrl} alt="" className="aspect-[4/5] w-full rounded-2xl bg-cream object-cover" />
              ) : (
                <SkeletonImage ratio="4/5" label={t("beauty.trying")} />
              )}
              <figcaption className="mt-1.5 text-center text-xs text-muted">{t("beauty.after")}</figcaption>
            </figure>
          </div>
        )}
        {stale && !busy && <Note>{t("beauty.stale")}</Note>}
        {faceError && !busy && <ErrorNote onRetry={run}>{t(`errors.${faceError}`)}</ErrorNote>}
        {!canTry && <p className="text-sm text-muted">{t("beauty.pickSomething")}</p>}
        {canTry && !faceUrl && !busy && (
          <div className="flex justify-end">
            <Button onClick={run}>{t("beauty.tryIt")}</Button>
          </div>
        )}
      </div>

      {/* The makeup on the full-body outfit photo */}
      {fullKey && (
        <div className="space-y-3 border-t border-line pt-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">{t("beauty.fullTitle")}</h3>
            <p className="text-xs text-muted">{t("beauty.fullNote")}</p>
          </div>
          {(fullBusy || fullUrl) && (
            <figure className="mx-auto w-full max-w-sm">
              {fullUrl && !fullBusy ? (
                <ZoomableImage src={fullUrl} className="aspect-[3/4] w-full rounded-2xl bg-cream object-cover" />
              ) : (
                <SkeletonImage label={t("beauty.fullTrying")} />
              )}
            </figure>
          )}
          {fullError && !fullBusy && <ErrorNote onRetry={runFull}>{t(`errors.${fullError}`)}</ErrorNote>}
          {!fullUrl && !fullBusy && (
            <div className="flex justify-end">
              <Button variant={faceUrl ? "primary" : "secondary"} onClick={runFull}>
                {t("beauty.fullTry")}
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
