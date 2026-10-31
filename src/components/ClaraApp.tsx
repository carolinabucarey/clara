"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { preloadVision } from "@/lib/pose/vision";
import type { GarmentAnalysis } from "@/lib/flow";
import { missingSlots, placePiece, removePiece, tryOnBaseFor, wearOrder } from "@/lib/look";
import { slotFor } from "@/lib/types";
import type {
  BeautyPrefs,
  ColorProfile,
  FaceShapeReading,
  Goal,
  MakeupCategory,
  Proportions,
  Slot,
  VerdictDraft,
  VerdictResult,
} from "@/lib/types";
import { ClaraAvatar, cx } from "./ui";
import { GarmentStep } from "./steps/GarmentStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ProfileStep } from "./steps/ProfileStep";
import { VerdictStep } from "./steps/VerdictStep";
import { LookStep } from "./steps/LookStep";
import { CompareStep } from "./steps/CompareStep";

export type Step = "garment" | "photos" | "profile" | "verdict" | "look" | "compare";

export interface Me {
  selfieUrl: string;
  selfieBlob: Blob;
  bodyUrl: string;
  bodyBlob: Blob;
  /** Head-and-shoulders crop for the hairstyle and makeup try-ons. */
  selfieWideUrl: string;
  selfieWideBlob: Blob;
  faceShape: FaceShapeReading | null;
  profile: ColorProfile;
  proportions: Proportions;
  measuredProfile: ColorProfile;
  measuredProportions: Proportions;
}

export interface Trial {
  garment: GarmentAnalysis;
  tryOnUrl?: string;
  tryOnError?: string;
  result?: VerdictResult;
  draft?: VerdictDraft;
  draftLocale?: string;
  lipUrl?: string;
  lipBeforeUrl?: string;
  /** "Better version": the same garment recolored to the user's palette, tried on. */
  betterUrl?: string;
  betterGarmentUrl?: string;
  betterHex?: string;
  /** The try-on image changed the face noticeably (see lib/pose/fidelity). */
  fidelityWarning?: boolean;
  /** Set when this piece was tried on over another piece of its look (lib/look). */
  tryOnOverUrl?: string;
}

/** Pieces worn together, plus the hair and makeup that finish the look. */
export interface Look {
  id: string;
  /** Trial index per slot. */
  pieces: Partial<Record<Slot, number>>;
  outfitUrl?: string;
  outfitKey?: string;
  outfitError?: string;
  outfitFidelityWarning?: boolean;
  /** Chosen hairstyle template; null keeps the person's own hair, undefined means Clara's first pick. */
  hairTemplateId?: string | null;
  makeupOff?: MakeupCategory[];
  hairUrl?: string;
  hairKey?: string;
  faceUrl?: string;
  faceKey?: string;
  faceError?: string;
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Fields to clear when their inputs change.
const STALE_BETTER: Partial<Trial> = { betterUrl: undefined, betterGarmentUrl: undefined, betterHex: undefined };
const STALE_VERDICT: Partial<Trial> = { result: undefined, draft: undefined, lipUrl: undefined, lipBeforeUrl: undefined, ...STALE_BETTER };
const STALE_TRY_ON: Partial<Trial> = {
  tryOnUrl: undefined,
  tryOnError: undefined,
  fidelityWarning: undefined,
  tryOnOverUrl: undefined,
  ...STALE_BETTER,
};

const STEPS: Array<Exclude<Step, "compare">> = ["garment", "photos", "profile", "verdict", "look"];

export function ClaraApp() {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState<Step>("garment");
  const [me, setMe] = useState<Me | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [current, setCurrent] = useState(0);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [looks, setLooks] = useState<Look[]>([]);
  /** Set while the person is adding a piece to an existing look. */
  const [complement, setComplement] = useState<{ look: number; slot: Slot } | null>(null);
  const [beauty, setBeauty] = useState<BeautyPrefs>({ makeup: null, hair: "all" });
  /** Where "back" goes from the garment step while a new piece is being added. */
  const [back, setBack] = useState<{ current: number; step: Step } | null>(null);

  useEffect(() => {
    preloadVision();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const trial = trials[current];
  const updateTrial = (patch: Partial<Trial>, index = current) =>
    setTrials((ts) => ts.map((tr, i) => (i === index ? { ...tr, ...patch } : tr)));

  const lookIndex = looks.findIndex((l) => Object.values(l.pieces).includes(current));
  const look = looks[lookIndex];
  const updateLook = (patch: Partial<Look>, index = lookIndex) =>
    setLooks((ls) => ls.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  /** Opens a piece, giving it a look of its own if it isn't in one (e.g. after being removed). */
  const openTrial = (i: number) => {
    setCurrent(i);
    if (!looks.some((l) => Object.values(l.pieces).includes(i))) {
      setLooks((ls) => [...ls, { id: newId(), pieces: { [slotFor(trials[i].garment.attrs.category)]: i } }]);
    }
  };

  const newPiece = (slot?: Slot) => {
    setComplement(slot ? { look: lookIndex, slot } : null);
    setBack({ current, step });
    setCurrent(trials.length);
    setStep("garment");
  };

  const stepIndex = step === "compare" ? STEPS.length : STEPS.indexOf(step);
  const reachable = useMemo(() => {
    const r = new Set<Step>(["garment"]);
    if (trial) r.add("photos");
    if (trial && me) r.add("profile").add("verdict");
    if (trial?.result) r.add("look");
    return r;
  }, [trial, me]);

  const startOver = () => {
    setTrials([]);
    setCurrent(0);
    setMe(null);
    setGoals([]);
    setLooks([]);
    setComplement(null);
    setBack(null);
    setStep("garment");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <button onClick={startOver} className="flex items-center gap-3 text-left" aria-label={t("nav.startOver")}>
          <ClaraAvatar size={48} />
          <span>
            <span className="font-display text-3xl font-semibold tracking-tight text-ink">Clara</span>
            <span className="block text-xs text-muted">{t("meta.tagline")}</span>
          </span>
        </button>
        <button
          onClick={() => setLocale(locale === "en" ? "es" : "en")}
          className="min-h-9 rounded-full border border-line bg-paper px-3 text-xs font-semibold text-ink hover:border-ink/40"
        >
          {t("nav.language")}
        </button>
      </header>

      <nav aria-label="Steps" className="mb-6">
        <ol className="flex items-center gap-1.5">
          {STEPS.map((s, i) => {
            const active = s === step;
            const done = i < stepIndex;
            const canGo = reachable.has(s) && !active;
            return (
              <li key={s} className="flex flex-1 flex-col gap-1.5">
                <button
                  disabled={!canGo}
                  onClick={() => {
                    if (!canGo) return;
                    setComplement(null);
                    setStep(s);
                  }}
                  className={cx("h-1.5 rounded-full transition", active ? "bg-clay" : done ? "bg-ink/70" : "bg-line")}
                  aria-current={active ? "step" : undefined}
                  aria-label={t(`nav.steps.${s}`)}
                />
                <span className={cx("hidden text-[11px] sm:block", active ? "font-semibold text-ink" : "text-muted")}>
                  {t(`nav.steps.${s}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="flex-1">
        {step === "garment" && (
          <GarmentStep
            key={trial?.garment.id ?? "new"}
            initial={trial?.garment}
            complement={complement?.slot}
            onBack={
              back && !trial
                ? () => {
                    setCurrent(back.current);
                    setStep(back.step);
                    setComplement(null);
                    setBack(null);
                  }
                : undefined
            }
            onDone={(g) => {
              const existing = trials.findIndex((tr) => tr.garment.id === g.id);
              if (existing >= 0) {
                // Same photo, possibly corrected attributes: invalidate the verdict, and the
                // try-on too when the category (what YouCam replaces) changed.
                const prev = trials[existing].garment;
                const retry = prev.attrs.category !== g.attrs.category;
                updateTrial(
                  {
                    garment: g,
                    ...STALE_VERDICT,
                    ...(retry ? STALE_TRY_ON : {}),
                    ...(prev.color.hex !== g.color.hex ? STALE_BETTER : {}),
                  },
                  existing,
                );
                // A new category can mean a new slot in its look.
                if (retry) {
                  setLooks((ls) =>
                    ls.map((l) =>
                      Object.values(l.pieces).includes(existing)
                        ? { ...l, pieces: placePiece(l.pieces, slotFor(g.attrs.category), existing) }
                        : l,
                    ),
                  );
                }
                setCurrent(existing);
              } else {
                const index = trials.length;
                const slot = slotFor(g.attrs.category);
                setTrials((ts) => [...ts, { garment: g }]);
                if (complement && looks[complement.look]) {
                  updateLook({ pieces: placePiece(looks[complement.look].pieces, slot, index) }, complement.look);
                } else {
                  setLooks((ls) => [...ls, { id: newId(), pieces: { [slot]: index } }]);
                }
                setCurrent(index);
              }
              setComplement(null);
              setBack(null);
              setStep(me ? "verdict" : "photos");
            }}
          />
        )}
        {step === "photos" && (
          <PhotosStep
            me={me}
            onDone={(m) => {
              setMe(m);
              // New photos: everything that was computed on the old ones is stale.
              setTrials((ts) => ts.map((tr) => ({ ...tr, ...STALE_VERDICT, ...STALE_TRY_ON })));
              setStep("profile");
            }}
            onKeep={() => setStep("profile")}
          />
        )}
        {step === "profile" && me && (
          <ProfileStep
            me={me}
            goals={goals}
            onGoals={setGoals}
            beauty={beauty}
            onBeauty={setBeauty}
            onChange={(patch) => {
              setMe({ ...me, ...patch });
              // The face shape only feeds hair and makeup; color and body corrections change the verdicts.
              if (patch.profile || patch.proportions) setTrials((ts) => ts.map((tr) => ({ ...tr, ...STALE_VERDICT })));
            }}
            onRetake={() => setStep("photos")}
            onDone={() => setStep("verdict")}
          />
        )}
        {step === "verdict" && me && trial && (
          <VerdictStep
            me={me}
            trial={trial}
            goals={goals}
            tryOnBase={look ? tryOnBaseFor(look.pieces, trials, current) : undefined}
            addSlot={look ? missingSlots(look.pieces).find((s) => s !== "outer") : undefined}
            onAddPiece={newPiece}
            onUpdate={(patch) => updateTrial(patch)}
            onLook={() => setStep("look")}
            onAnother={() => newPiece()}
            onCompare={trials.filter((tr) => tr.result).length > 1 ? () => setStep("compare") : undefined}
            onEditGarment={() => setStep("garment")}
          />
        )}
        {step === "look" && me && trial?.result && look && (
          <LookStep
            me={me}
            trials={trials}
            look={look}
            current={current}
            goals={goals}
            beauty={beauty}
            onBeauty={setBeauty}
            onUpdateLook={(patch) => updateLook(patch)}
            onUpdateTrial={updateTrial}
            onAddPiece={newPiece}
            onOpenPiece={(i) => {
              setCurrent(i);
              setStep("verdict");
            }}
            onRemovePiece={(slot) => {
              const pieces = removePiece(look.pieces, slot);
              if (look.pieces[slot] === current) setCurrent(pieces[wearOrder(pieces)[0]]!);
              updateLook({ pieces });
            }}
            onAnother={() => newPiece()}
          />
        )}
        {step === "compare" && (
          <CompareStep
            trials={trials}
            onOpen={(i) => {
              openTrial(i);
              setStep("verdict");
            }}
          />
        )}
      </main>

      <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        <p>{t("privacy")}</p>
        <p className="mt-1">Powered by YouCam AI APIs · Claude</p>
      </footer>
    </div>
  );
}
