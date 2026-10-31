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
  onFile,
  error,
}: {
  title: string;
  tips: string;
  file: File | null;
  onFile: (f: File) => void;
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
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <p className="text-sm text-muted">{tips}</p>
      </div>
      <div className={cx("aspect-[3/4] w-full overflow-hidden rounded-2xl", url ? "bg-cream" : "checker")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <FilePicker label={t("photos.pick")} onFile={onFile} variant={file ? "secondary" : "primary"} />
    </Card>
  );
}

export function PhotosStep({ me, onDone, onKeep }: { me: Me | null; onDone: (m: Me) => void; onKeep: () => void }) {
  const { t, locale } = useI18n();
  const [selfie, setSelfie] = useState<File | null>(null);
  const [body, setBody] = useState<File | null>(null);
  const [unit, setUnit] = useState<"cm" | "ft">(locale === "en" ? "ft" : "cm");
  const [cm, setCm] = useState("165");
  const [ft, setFt] = useState("5");
  const [inch, setInch] = useState("5");
  const [loose, setLoose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selfieError, setSelfieError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const heightCm = unit === "cm" ? Number(cm) : Math.round((Number(ft) * 12 + Number(inch)) * 2.54);
  const heightOk = Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 215;

  if (me && !replacing) {
    return (
      <div className="space-y-5">
        <StepHeader title={t("photos.title")} />
        <Note>{t("photos.savedProfile")}</Note>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => setReplacing(true)}>
            {t("photos.newPhotos")}
          </Button>
          <Button onClick={onKeep}>{t("common.continue")}</Button>
        </div>
      </div>
    );
  }

  const analyze = async () => {
    if (!selfie || !body || !heightOk) return;
    setSelfieError(null);
    setBodyError(null);
    setBusy(true);
    const [s, b] = await Promise.allSettled([analyzeSelfie(selfie), analyzeBody(body, heightCm, loose)]);
    setBusy(false);
    if (s.status === "rejected") setSelfieError(t(`errors.${errorCode(s.reason)}`));
    if (b.status === "rejected") setBodyError(t(`errors.${errorCode(b.reason)}`));
    if (s.status === "fulfilled" && b.status === "fulfilled") {
      onDone({
        ...s.value,
        ...b.value,
        measuredProfile: s.value.profile,
        measuredProportions: b.value.proportions,
      });
    }
  };

  const input = "h-11 rounded-xl border border-line bg-paper px-3 text-base text-ink focus:border-ink focus:outline-none";

  return (
    <div className="space-y-5">
      <StepHeader title={t("photos.title")} subtitle={t("photos.subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PhotoSlot title={t("photos.selfie")} tips={t("photos.selfieTips")} file={selfie} onFile={setSelfie} error={selfieError} />
        <PhotoSlot title={t("photos.body")} tips={t("photos.bodyTips")} file={body} onFile={setBody} error={bodyError} />
      </div>
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
      <div className="flex flex-wrap items-center justify-end gap-4">
        {busy && <Spinner label={t("photos.measuringColor")} />}
        <Button onClick={analyze} disabled={!selfie || !body || !heightOk || busy}>
          {t("photos.analyze")}
        </Button>
      </div>
    </div>
  );
}
