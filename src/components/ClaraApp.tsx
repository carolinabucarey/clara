"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { preloadVision } from "@/lib/pose/vision";
import type { GarmentAnalysis } from "@/lib/flow";
import type { ColorProfile, Goal, Proportions, VerdictDraft, VerdictResult } from "@/lib/types";
import { cx } from "./ui";
import { GarmentStep } from "./steps/GarmentStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ProfileStep } from "./steps/ProfileStep";
import { VerdictStep } from "./steps/VerdictStep";
import { RescueStep } from "./steps/RescueStep";
import { CompareStep } from "./steps/CompareStep";

export type Step = "garment" | "photos" | "profile" | "verdict" | "rescue" | "compare";

export interface Me {
  selfieUrl: string;
  selfieBlob: Blob;
  bodyUrl: string;
  bodyBlob: Blob;
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
}

const STEPS: Array<Exclude<Step, "compare">> = ["garment", "photos", "profile", "verdict", "rescue"];

export function ClaraApp() {
  const { t, locale, setLocale } = useI18n();
  const [step, setStep] = useState<Step>("garment");
  const [me, setMe] = useState<Me | null>(null);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [current, setCurrent] = useState(0);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    preloadVision();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const trial = trials[current];
  const updateTrial = (patch: Partial<Trial>, index = current) =>
    setTrials((ts) => ts.map((tr, i) => (i === index ? { ...tr, ...patch } : tr)));

  const stepIndex = step === "compare" ? STEPS.length : STEPS.indexOf(step);
  const reachable = useMemo(() => {
    const r = new Set<Step>(["garment"]);
    if (trial) r.add("photos");
    if (trial && me) r.add("profile").add("verdict");
    if (trial?.result) r.add("rescue");
    return r;
  }, [trial, me]);

  const startOver = () => {
    setTrials([]);
    setCurrent(0);
    setMe(null);
    setGoals([]);
    setStep("garment");
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <button onClick={startOver} className="text-left" aria-label={t("nav.startOver")}>
          <span className="font-display text-3xl font-semibold tracking-tight text-ink">Clara</span>
          <span className="block text-xs text-muted">{t("meta.tagline")}</span>
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
                  onClick={() => canGo && setStep(s)}
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
            onDone={(g) => {
              const existing = trials.findIndex((tr) => tr.garment.id === g.id);
              if (existing >= 0) {
                // Same photo, possibly corrected attributes: invalidate the verdict.
                updateTrial({ garment: g, result: undefined, draft: undefined, lipUrl: undefined }, existing);
                setCurrent(existing);
              } else {
                setTrials((ts) => [...ts, { garment: g }]);
                setCurrent(trials.length);
              }
              setStep(me ? "verdict" : "photos");
            }}
          />
        )}
        {step === "photos" && (
          <PhotosStep
            me={me}
            onDone={(m) => {
              setMe(m);
              setTrials((ts) => ts.map((tr) => ({ ...tr, result: undefined, draft: undefined })));
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
            onChange={(patch) => {
              setMe({ ...me, ...patch });
              setTrials((ts) => ts.map((tr) => ({ ...tr, result: undefined, draft: undefined, lipUrl: undefined })));
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
            onUpdate={(patch) => updateTrial(patch)}
            onRescue={() => setStep("rescue")}
            onAnother={() => {
              setCurrent(trials.length);
              setStep("garment");
            }}
            onCompare={trials.filter((tr) => tr.result).length > 1 ? () => setStep("compare") : undefined}
            onEditGarment={() => setStep("garment")}
          />
        )}
        {step === "rescue" && me && trial?.result && (
          <RescueStep me={me} trial={trial} onUpdate={(patch) => updateTrial(patch)} onBack={() => setStep("verdict")} />
        )}
        {step === "compare" && (
          <CompareStep
            trials={trials}
            onOpen={(i) => {
              setCurrent(i);
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
