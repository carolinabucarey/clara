"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { analyzeBody, analyzeSelfie, errorCode } from "@/lib/flow";
import type { Me } from "../ClaraApp";
import { Button, Card, cx, ErrorNote, FilePicker, Note, Spinner, StepHeader } from "../ui";

function PhotoSlot({
  title,
  tips,
  file,
  current,
  onFile,
  onKeepCurrent,
  error,
}: {
  title: string;
  tips: string;
  file: File | null;
  /** The photo in use, shown until a new one is picked. */
  current?: string;
  onFile: (f: File) => void;
  onKeepCurrent: () => void;
  error?: string | null;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL lifecycle tied to the file
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const shown = file ? url : current;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <p className="text-sm text-muted">{tips}</p>
      </div>
      <div className={cx("aspect-[3/4] w-full overflow-hidden rounded-2xl", shown ? "bg-cream" : "checker")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown && <img src={shown} alt="" className="h-full w-full object-cover" />}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <FilePicker
        label={shown ? t("photos.change") : t("photos.pick")}
        onFile={onFile}
        variant={shown ? "secondary" : "primary"}
      />
      {file && current && (
        <button className="text-sm font-semibold text-clay underline-offset-4 hover:underline" onClick={onKeepCurrent}>
          {t("photos.keepCurrent")}
        </button>
      )}
    </Card>
  );
}

const toFeet = (cm: number) => {
  const inches = Math.round(cm / 2.54);
  return { ft: String(Math.floor(inches / 12)), inch: String(inches % 12) };
};

export function PhotosStep({
  me,
  fromAccount,
  onDone,
  onKeep,
}: {
  me: Me | null;
  /** The photos came from the person's account rather than this session. */
  fromAccount?: boolean;
  /** Only the photos that changed were measured again. */
  onDone: (m: Me, changed: { selfie: boolean; body: boolean }) => void;
  onKeep: () => void;
}) {
  const { t, locale } = useI18n();
  const [selfie, setSelfie] = useState<File | null>(null);
  const [body, setBody] = useState<File | null>(null);
  const [unit, setUnit] = useState<"cm" | "ft">(locale === "en" ? "ft" : "cm");
  const [cm, setCm] = useState(me ? String(me.proportions.heightCm) : "165");
  const [ft, setFt] = useState(me ? toFeet(me.proportions.heightCm).ft : "5");
  const [inch, setInch] = useState(me ? toFeet(me.proportions.heightCm).inch : "5");
  const [loose, setLoose] = useState(me?.proportions.issues.includes("loose_clothing") ?? false);
  const [busy, setBusy] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const heightCm = unit === "cm" ? Number(cm) : Math.round((Number(ft) * 12 + Number(inch)) * 2.54);
  const heightOk = Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 215;
  const changed = !!(selfie || body);
  const ready = (me ? changed : !!(selfie && body)) && (!body || heightOk);

  const analyze = async () => {
    if (!ready) return;
    setSelfieError(null);
    setBodyError(null);
    setBusy(true);
    const [s, b] = await Promise.allSettled([
      selfie ? analyzeSelfie(selfie) : null,
      body ? analyzeBody(body, heightCm, loose) : null,
    ]);
    setBusy(false);
    if (s.status === "rejected") setSelfieError(t(`errors.${errorCode(s.reason)}`));
    if (b.status === "rejected") setBodyError(t(`errors.${errorCode(b.reason)}`));
    if (s.status === "rejected" || b.status === "rejected") return;
    const face = s.value && { ...s.value, measuredProfile: s.value.profile };
    const figure = b.value && { ...b.value, measuredProportions: b.value.proportions };
    if (me) onDone({ ...me, ...face, ...figure }, { selfie: !!face, body: !!figure });
    else if (face && figure) onDone({ ...face, ...figure }, { selfie: true, body: true });
  };

  const input = "h-11 rounded-xl border border-line bg-paper px-3 text-base text-ink focus:border-ink focus:outline-none";

  return (
    <div className="space-y-5">
      <StepHeader title={t("photos.title")} subtitle={me ? undefined : t("photos.subtitle")} />
      {me && <Note>{`${fromAccount ? t("photos.savedAccount") : t("photos.savedProfile")} ${t("photos.changeHint")}`}</Note>}
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoSlot
          title={t("photos.selfie")}
          tips={t("photos.selfieTips")}
          file={selfie}
          current={me?.selfieWideUrl}
          onFile={setSelfie}
          onKeepCurrent={() => {
            setSelfie(null);
            setSelfieError(null);
          }}
          error={selfieError}
        />
        <PhotoSlot
          title={t("photos.body")}
          tips={t("photos.bodyTips")}
          file={body}
          current={me?.bodyUrl}
          onFile={setBody}
          onKeepCurrent={() => {
            setBody(null);
            setBodyError(null);
          }}
          error={bodyError}
        />
      </div>
      {/* The height only feeds the body measurement: asked again only with a new body photo. */}
      {(!me || body) && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-ink">{t("photos.height")}</span>
              {unit === "cm" ? (
                <span className="flex items-center gap-2">
                  <input className={cx(input, "w-24")} inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value)} />
                  <span className="text-sm text-muted">{t("common.cm")}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <input className={cx(input, "w-16")} inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} />
                  <span className="text-sm text-muted">{t("common.ft")}</span>
                  <input className={cx(input, "w-16")} inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} />
                  <span className="text-sm text-muted">{t("common.in")}</span>
                </span>
              )}
            </label>
            <div className="flex rounded-full border border-line p-0.5 text-xs">
              {(["cm", "ft"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={cx("min-h-8 rounded-full px-3", unit === u ? "bg-ink text-cream" : "text-muted")}
                >
                  {u === "cm" ? "cm" : "ft / in"}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm text-ink">
            <input type="checkbox" checked={loose} onChange={(e) => setLoose(e.target.checked)} className="h-5 w-5 accent-[var(--clay)]" />
            {t("photos.loose")}
          </label>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-end gap-4">
        {busy && <Spinner label={selfie ? t("photos.measuringColor") : t("photos.measuringBody")} />}
        {me && !changed ? (
          <Button onClick={onKeep}>{t("common.continue")}</Button>
        ) : (
          <Button onClick={analyze} disabled={!ready || busy}>
            {t("photos.analyze")}
          </Button>
        )}
      </div>
    </div>
  );
}
