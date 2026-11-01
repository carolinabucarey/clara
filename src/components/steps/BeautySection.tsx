"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { applyHairColor, applyLookOnBody, applyMakeupLook, errorCode } from "@/lib/flow";
import { makeupEffects, makeupFor, makeupShades, shadeOf } from "@/lib/beauty/makeup";
import { hairColorsFor } from "@/lib/beauty/haircolor";
import type { BeautyPrefs, MakeupCategory } from "@/lib/types";
import type { Look, Me } from "../ClaraApp";
import { Button, Card, cx, ErrorNote, Note, ShadePicker, SkeletonImage } from "../ui";
import { ZoomableImage } from "../ZoomableImage";

/** A hair color to pick: the dye as a round swatch, or the person's own hair in the selfie. */
function HairColorTile({
  label,
  hex,
  photo,
  selected,
  onClick,
}: {
  label: string;
  hex?: string;
  photo?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="flex w-16 flex-col items-center gap-1.5">
      <span
        className={cx(
          "block h-14 w-14 overflow-hidden rounded-full bg-cream",
          selected ? "ring-2 ring-ink ring-offset-2" : "border border-black/10",
        )}
        style={hex ? { background: hex } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="w-full text-center text-xs leading-tight text-ink">{label}</span>
    </button>
  );
}

/** Hair color and makeup that finish the look: Clara's picks, why, and a before/after portrait. */
export function BeautySection({
  me,
  look,
  beauty,
  onBeauty,
  outfitHexes,
  outfitUrl,
  onUpdateLook,
  onShown,
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
  /** Told which portrait and full look are current (the ones shown), for the share card. */
  onShown?: (shown: { faceUrl?: string; fullUrl?: string }) => void;
}) {
  const { t, tl } = useI18n();
  const [busy, setBusy] = useState(false);
  const [fullBusy, setFullBusy] = useState(false);
  const faceShape = me.faceShape?.shape ?? null;

  const hairColors = useMemo(() => hairColorsFor(me.profile), [me.profile]);
  const hair = hairColors.find((c) => c.hex === look.hairColor) ?? null;

  const shades = useMemo(() => makeupShades(me.profile), [me.profile]);
  const steps = useMemo(
    () => (beauty.makeup ? makeupFor(me.profile, faceShape, outfitHexes, look.makeupShades) : []),
    [beauty.makeup, me.profile, faceShape, outfitHexes, look.makeupShades],
  );
  const kept = steps.filter((s) => !look.makeupOff?.includes(s.category));
  const effects = makeupEffects(kept);

  const hairKey = hair ? `${me.selfieWideUrl}|${hair.hex}` : null;
  const lookSpec = `${hair?.hex ?? ""}|${JSON.stringify(effects)}`;
  const faceKey = `${me.selfieWideUrl}|${lookSpec}`;
  const faceUrl = look.faceKey === faceKey ? look.faceUrl : undefined;
  const faceError = look.faceKey === faceKey ? look.faceError : undefined;
  const stale = !!look.faceUrl && look.faceKey !== faceKey;
  const canTry = !!hair || effects.length > 0;
  const fullKey = outfitUrl && canTry ? `${outfitUrl}|${lookSpec}` : null;
  const fullUrl = fullKey && look.fullKey === fullKey ? look.fullUrl : undefined;
  const fullError = fullKey && look.fullKey === fullKey ? look.fullError : undefined;
  useEffect(() => {
    onShown?.({ faceUrl, fullUrl });
  }, [onShown, faceUrl, fullUrl]);
  const used = { faceMakeup: kept, faceHairColor: hair };

  const run = async () => {
    setBusy(true);
    onUpdateLook({ faceUrl: undefined, faceError: undefined, faceKey });
    try {
      let hairUrl = hairKey && look.hairKey === hairKey ? look.hairUrl : undefined;
      if (hair && !hairUrl) {
        hairUrl = await applyHairColor(me.selfieWideBlob, hair.hex);
        onUpdateLook({ hairUrl, hairKey: hairKey! });
      }
      const url = effects.length > 0 ? await applyMakeupLook(effects, hair ? hairUrl! : null, me.selfieWideBlob) : hairUrl!;
      onUpdateLook({ faceUrl: url, faceKey, ...used });
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
      const url = await applyLookOnBody(outfitUrl, effects, hair?.hex ?? null);
      onUpdateLook({ fullUrl: url, fullKey, ...used });
    } catch (e) {
      onUpdateLook({ fullError: errorCode(e), fullKey });
    } finally {
      setFullBusy(false);
    }
  };

  const toggleStep = (category: MakeupCategory) => {
    const off = look.makeupOff ?? [];
    onUpdateLook({ makeupOff: off.includes(category) ? off.filter((c) => c !== category) : [...off, category] });
  };

  /** Picking a shade also puts the step back in the look. */
  const pickShade = (category: MakeupCategory, name: string) => {
    const picked = { ...look.makeupShades };
    if (name === shades[category][0].name) delete picked[category];
    else picked[category] = name;
    onUpdateLook({ makeupShades: picked, makeupOff: look.makeupOff?.filter((c) => c !== category) });
  };
  const shadeLabel = (category: MakeupCategory, name: string) => t(category === "lip_color" ? `lipsticks.${name}` : `shades.${name}`);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-display text-xl text-ink">{t("beauty.title")}</h2>
        <p className="text-sm text-muted">{t("beauty.subtitle")}</p>
      </div>

      {/* Hair color */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{t("beauty.hairTitle")}</h3>
          <p className="text-xs text-muted">{t("beauty.hairNote")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <HairColorTile
            label={t("beauty.ownHair")}
            photo={me.selfieWideUrl}
            selected={!hair}
            onClick={() => onUpdateLook({ hairColor: undefined })}
          />
          {hairColors.map((c) => (
            <HairColorTile
              key={c.hex}
              label={t(`shades.${c.params.shade}`)}
              hex={c.hex}
              selected={hair?.hex === c.hex}
              onClick={() => onUpdateLook({ hairColor: c.hex })}
            />
          ))}
        </div>
        {hair && (
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm leading-relaxed text-ink">{tl(`beauty.hairWhy.${hair.code}`, hair.params)}</p>
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
                  <div className={cx("min-w-0 flex-1 space-y-2.5", !on && "opacity-50")}>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t(`beauty.categories.${s.category}`)}</p>
                      <p className="text-sm leading-relaxed text-ink">{tl(`beauty.why.${s.code}`, s.params)}</p>
                    </div>
                    <ShadePicker
                      shades={shades[s.category]}
                      value={shadeOf(s)}
                      onChange={(name) => pickShade(s.category, name)}
                      label={(name) => shadeLabel(s.category, name)}
                    />
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
