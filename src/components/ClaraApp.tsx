"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { preloadVision } from "@/lib/pose/vision";
import type { GarmentAnalysis } from "@/lib/flow";
import { missingSlots, outfitKey, placePiece, removePiece, tryOnBaseFor, wearOrder } from "@/lib/look";
import { deleteAccount, signOut, useAccount } from "@/lib/account/session";
import { deleteAllData, hasProfile, loadProfile, saveProfile } from "@/lib/account/profile";
import { saveLook, type SavedHairstyle } from "@/lib/account/looks";
import { SaveError } from "@/lib/account/storage";
import { evaluateOutfit } from "@/lib/verdict/outfit";
import { slotFor } from "@/lib/types";
import type {
  BeautyPrefs,
  ColorProfile,
  FaceShapeReading,
  Goal,
  MakeupCategory,
  MakeupStep,
  Proportions,
  Slot,
  VerdictDraft,
  VerdictResult,
} from "@/lib/types";
import { Button, ClaraAvatar, cx, ErrorNote, Note } from "./ui";
import { AccountButton } from "./AccountButton";
import { AuthDialog } from "./AuthDialog";
import { GarmentStep } from "./steps/GarmentStep";
import { PhotosStep } from "./steps/PhotosStep";
import { ProfileStep } from "./steps/ProfileStep";
import { VerdictStep } from "./steps/VerdictStep";
import { LookStep } from "./steps/LookStep";
import { CompareStep } from "./steps/CompareStep";
import { MyLooksStep } from "./steps/MyLooksStep";

export type Step = "garment" | "photos" | "profile" | "verdict" | "look" | "compare" | "looks";

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
  /** What the portrait in faceUrl was made with, to save it alongside. */
  faceMakeup?: MakeupStep[];
  faceHair?: SavedHairstyle | null;
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

const STEPS: Array<Exclude<Step, "compare" | "looks">> = ["garment", "photos", "profile", "verdict", "look"];

/** Identifies what a save captured, so "Saved" turns back into "Save look" after a change. */
const lookSignature = (l: Look) => JSON.stringify([l.pieces, l.outfitKey, l.faceKey]);

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

  // Account: optional (see useAccount below). Signing in restores the saved profile; saving a look can save it too.
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);
  const [consent, setConsent] = useState(false);
  /** Whether the account holds a profile, and for which photos (to re-upload only when they change). */
  const [profileSync, setProfileSync] = useState<{ saved: boolean; selfieUrl: string | null }>({ saved: false, selfieUrl: null });
  const [meFromAccount, setMeFromAccount] = useState(false);
  const [save, setSave] = useState<{ signature: string; status: "saving" | "saved" | "error" | "expired" } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lastUser = useRef<string | null>(null);

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

  const doSave = async (withProfile: boolean) => {
    if (!look || !me) return;
    const signature = lookSignature(look);
    setSave({ signature, status: "saving" });
    try {
      const order = wearOrder(look.pieces);
      const pieceOf = (slot: Slot) => trials[look.pieces[slot]!];
      const multi = order.length > 1;
      const outfitUrl = multi
        ? look.outfitKey === outfitKey(look.pieces, trials, me.bodyUrl)
          ? (look.outfitUrl ?? null)
          : null
        : (pieceOf(order[0]).tryOnUrl ?? null);
      const outfit = evaluateOutfit(
        Object.fromEntries(order.map((s) => [s, { attrs: pieceOf(s).garment.attrs, color: pieceOf(s).garment.color }])),
        me.proportions,
        goals,
      );
      await saveLook({
        pieces: order.map((slot) => ({ slot, trial: pieceOf(slot) })),
        outfitUrl,
        outfit,
        faceUrl: look.faceUrl ?? null,
        makeup: look.faceUrl ? (look.faceMakeup ?? null) : null,
        hairstyle: look.faceUrl ? (look.faceHair ?? null) : null,
      });
      // With consent the first time; afterwards the account profile simply stays current.
      if (withProfile || profileSync.saved) {
        await saveProfile(me, { beauty, goals }, profileSync.selfieUrl !== me.selfieUrl);
        setProfileSync({ saved: true, selfieUrl: me.selfieUrl });
      }
      setSave({ signature, status: "saved" });
    } catch (e) {
      setSave({ signature, status: e instanceof SaveError && e.code === "expired" ? "expired" : "error" });
    }
  };

  const onSaveLook = () => {
    if (!account.user) {
      setPendingSave(true);
      setAuthOpen(true);
      return;
    }
    void doSave(consent);
  };

  // React to sign-in: close the dialog, finish a pending save, restore the saved profile.
  function onUserChange(uid: string | null) {
    if (uid === lastUser.current) return;
    lastUser.current = uid;
    if (!uid) {
      setProfileSync({ saved: false, selfieUrl: null });
      return;
    }
    setAuthOpen(false);
    if (pendingSave) {
      setPendingSave(false);
      void doSave(consent);
    }
    if (me) {
      hasProfile()
        .then((saved) => setProfileSync((p) => ({ ...p, saved })))
        .catch(() => undefined);
      return;
    }
    loadProfile()
      .then((saved) => {
        if (!saved) return;
        setMe((current) => current ?? saved.me);
        setBeauty(saved.beauty);
        setGoals(saved.goals);
        setProfileSync({ saved: true, selfieUrl: saved.me.selfieUrl });
        setMeFromAccount(true);
      })
      .catch(() => undefined);
  }

  const account = useAccount((user) => onUserChange(user?.id ?? null));

  const onDeleteData = async () => {
    if (!window.confirm(t("account.confirmDeleteData"))) return;
    try {
      await deleteAllData();
      setProfileSync({ saved: false, selfieUrl: null });
      setSave(null);
      setNotice(t("account.deleted"));
      if (step === "looks") setStep("garment");
    } catch {
      setNotice(t("account.errors.generic"));
    }
  };

  const onDeleteAccount = async () => {
    if (!window.confirm(t("account.confirmDeleteAccount"))) return;
    try {
      await deleteAccount();
      setProfileSync({ saved: false, selfieUrl: null });
      setSave(null);
      setNotice(t("account.deleted"));
      if (step === "looks") setStep("garment");
    } catch {
      setNotice(t("account.errors.generic"));
    }
  };

  const saveStatus = look && save?.signature === lookSignature(look) ? save.status : null;
  const saveActions = account.enabled && look && (
    <>
      {account.user && !profileSync.saved && (
        <label className="flex basis-full items-start justify-end gap-2 text-right text-xs text-muted">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--clay)]"
          />
          <span className="max-w-sm">{t("account.consent")}</span>
        </label>
      )}
      <Button onClick={onSaveLook} disabled={saveStatus === "saving" || saveStatus === "saved"}>
        {saveStatus === "saved" ? `✓ ${t("look.saved")}` : saveStatus === "saving" ? t("look.saving") : t("look.save")}
      </Button>
      {saveStatus === "error" && (
        <div className="basis-full">
          <ErrorNote onRetry={onSaveLook}>{t("look.saveFailed")}</ErrorNote>
        </div>
      )}
      {saveStatus === "expired" && (
        <div className="basis-full">
          <ErrorNote>{t("look.expired")}</ErrorNote>
        </div>
      )}
    </>
  );

  const stepIndex = step === "compare" || step === "looks" ? STEPS.length : STEPS.indexOf(step);
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
    setSave(null);
    setMeFromAccount(false);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocale(locale === "en" ? "es" : "en")}
            className="min-h-9 rounded-full border border-line bg-paper px-3 text-xs font-semibold text-ink hover:border-ink/40"
          >
            {t("nav.language")}
          </button>
          {account.enabled && account.ready && (
            <AccountButton
              user={account.user}
              onSignIn={() => setAuthOpen(true)}
              onMyLooks={() => {
                if (step !== "looks") setBack({ current, step });
                setStep("looks");
              }}
              onDeleteData={onDeleteData}
              onDeleteAccount={onDeleteAccount}
              onSignOut={() => void signOut()}
            />
          )}
        </div>
      </header>

      {account.enabled && (
        <AuthDialog
          open={authOpen}
          onClose={() => {
            setAuthOpen(false);
            setPendingSave(false);
          }}
          consent={pendingSave && !profileSync.saved ? { checked: consent, onChange: setConsent } : undefined}
        />
      )}
      {notice && (
        <div className="mb-4">
          <Note>{notice}</Note>
        </div>
      )}

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
            fromAccount={meFromAccount}
            onDone={(m) => {
              setMe(m);
              setMeFromAccount(false);
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
            actions={saveActions}
          />
        )}
        {step === "looks" && account.user && (
          <MyLooksStep
            onBack={() => {
              if (back) {
                setCurrent(back.current);
                setStep(back.step);
                setBack(null);
              } else {
                setStep("garment");
              }
            }}
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
