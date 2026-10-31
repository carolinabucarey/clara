"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/context";
import { analyzeGarment, errorCode, FlowError, type GarmentAnalysis } from "@/lib/flow";
import { describeGarmentColor } from "@/lib/color/garment";
import {
  FITS,
  GARMENT_CATEGORIES,
  LEGS,
  LENGTHS,
  NECKLINES,
  PATTERNS,
  RISES,
  SLEEVES,
  SLOT_CATEGORY,
  WAISTS,
  type GarmentAttributes,
  type Slot,
} from "@/lib/types";
import { Button, Card, ChipSelect, ErrorNote, FilePicker, Note, SkeletonImage, Spinner, StepHeader, Swatch } from "../ui";

interface DemoGarment {
  src: string;
  label: string;
}

const TOP_LENGTHS = ["cropped", "waist", "hip", "tunic"] as const;
const LONG_LENGTHS = ["mini", "knee", "midi", "maxi", "ankle", "full_length"] as const;

const noSubscribe = () => () => {};

export function GarmentStep({
  initial,
  complement,
  onDone,
  onBack,
}: {
  initial?: GarmentAnalysis;
  /** Adding this slot to an existing look: the category is already known. */
  complement?: Slot;
  onDone: (g: GarmentAnalysis) => void;
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const [analysis, setAnalysis] = useState<GarmentAnalysis | null>(initial ?? null);
  const [attrs, setAttrs] = useState<GarmentAttributes | null>(initial?.attrs ?? null);
  const [colorHex, setColorHex] = useState<string | null>(initial?.color.hex ?? null);
  const [stage, setStage] = useState<"idle" | "reading" | "isolating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<Blob | null>(null);
  const [demos, setDemos] = useState<DemoGarment[]>([]);
  const [link, setLink] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkFound, setLinkFound] = useState<{ url: string; title: string | null; images: string[] } | null>(null);
  // "Use another photo" reopens every way in (upload, paste, link, demos), keeping the
  // current analysis until a new one replaces it.
  const [picking, setPicking] = useState(false);
  // Requests still loading (store link, demo, clipboard) remember the pick they started in;
  // after a newer pick or "Keep the current one", their result is dropped.
  const pickId = useRef(0);

  useEffect(() => {
    fetch("/demo/garments.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: DemoGarment[]) => setDemos(Array.isArray(list) ? list : []))
      .catch(() => setDemos([]));
  }, []);

  const run = async (file: Blob, source?: GarmentAnalysis["source"]) => {
    pickId.current++;
    setLinkBusy(false);
    setLastFile(file);
    setError(null);
    setPicking(false);
    setAnalysis(null);
    setStage("reading");
    try {
      const read = await analyzeGarment(file, (s) => setStage(s));
      // The person said what this piece is: trust that over the automatic reading.
      const a = { ...(complement ? { ...read, attrs: { ...read.attrs, category: SLOT_CATEGORY[complement] } } : read), source };
      setAnalysis(a);
      setAttrs(a.attrs);
      setColorHex(a.color.hex);
    } catch (e) {
      setError(t(`errors.${errorCode(e)}`));
    } finally {
      setStage("idle");
    }
  };

  // A photo copied on the store page works like an upload: a store that blocks our link
  // fetch can't block the person's own browser. Cmd/Ctrl+V anywhere on this step…
  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    if ((analysis && !picking) || stage !== "idle") return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    void run(file);
  });
  useEffect(() => {
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  // …or a button, for phones where there's no keyboard shortcut to paste with.
  const canPaste = useSyncExternalStore(noSubscribe, () => !!navigator.clipboard?.read, () => false);
  const pasteFromClipboard = async () => {
    const id = ++pickId.current;
    setError(null);
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((ty) => ty.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        if (id === pickId.current) void run(blob);
        return;
      }
    } catch {
      /* permission refused or nothing readable: same advice as an empty clipboard */
    }
    if (id === pickId.current) setError(t("errors.pasteNoImage"));
  };

  /** A product photo from the store page, through our same-origin proxy. */
  const pickLinkImage = async (src: string, found: { url: string; title: string | null }, id = ++pickId.current) => {
    setLinkBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/garment/link?image=${encodeURIComponent(src)}`);
      if (!res.ok) throw new FlowError("linkNoImage");
      const blob = await res.blob();
      if (id !== pickId.current) return;
      setLinkFound(null);
      void run(blob, found);
    } catch (e) {
      if (id === pickId.current) setError(t(`errors.${errorCode(e)}`));
    } finally {
      if (id === pickId.current) setLinkBusy(false);
    }
  };

  const submitLink = async () => {
    const url = link.trim();
    if (!url) return;
    const id = ++pickId.current;
    setLinkBusy(true);
    setError(null);
    setLinkFound(null);
    try {
      const res = await fetch("/api/garment/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string | null; images?: string[] };
      if (id !== pickId.current) return;
      if (!res.ok || !data.images?.length) throw new FlowError(data.error ?? "linkUnreachable");
      const found = { url, title: data.title ?? null, images: data.images };
      setLinkBusy(false);
      // One photo: straight to the analysis. Several: let the person pick the clearest one.
      if (found.images.length === 1) await pickLinkImage(found.images[0], found, id);
      else setLinkFound(found);
    } catch (e) {
      if (id !== pickId.current) return;
      setError(t(`errors.${errorCode(e)}`));
      setLinkBusy(false);
    }
  };

  const pickDemo = async (d: DemoGarment) => {
    const id = ++pickId.current;
    try {
      const res = await fetch(d.src);
      if (!res.ok) throw new Error("demo_unavailable");
      const blob = await res.blob();
      if (id === pickId.current) await run(blob);
    } catch {
      if (id === pickId.current) setError(t("errors.imageUnreadable"));
    }
  };

  /** Back to the current garment, dropping whatever the picker is still loading. */
  const keepCurrent = () => {
    pickId.current++;
    setLinkBusy(false);
    setError(null);
    setPicking(false);
  };

  const pickAnother = () => {
    setPicking(true);
    setError(null);
    setLink("");
    setLinkFound(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const busy = stage !== "idle";
  const showPicker = (!analysis || picking) && !busy;
  const set = <K extends keyof GarmentAttributes>(k: K, v: GarmentAttributes[K]) =>
    setAttrs((a) => (a ? { ...a, [k]: v, uncertain: a.uncertain.filter((u) => u !== k) } : a));
  const opts = <T extends string>(group: string, values: readonly T[]) =>
    values.map((v) => ({ value: v, label: t(`attr.${group}.${v}`) }));

  const confirm = () => {
    if (!analysis || !attrs || !colorHex) return;
    const share = analysis.clusters.find((c) => c.hex === colorHex)?.share ?? 1;
    onDone({ ...analysis, attrs: { ...attrs, uncertain: [] }, color: describeGarmentColor(colorHex, share) });
  };

  const cat = attrs?.category;
  const isBottom = cat === "lower_body";
  const isTop = cat === "upper_body" || cat === "outer";

  return (
    <div className="space-y-5">
      <StepHeader
        title={complement ? t(`garment.complementTitle.${complement}`) : t("garment.title")}
        subtitle={complement ? t("garment.complementSubtitle") : t("garment.subtitle")}
      />

      {showPicker && (
        <Card className="flex flex-col items-center gap-4 border-dashed py-10 text-center">
          <div className="text-5xl" aria-hidden>
            👗
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <FilePicker label={t("garment.upload")} onFile={(f) => run(f)} />
            {canPaste && (
              <Button variant="secondary" onClick={pasteFromClipboard}>
                {t("garment.paste")}
              </Button>
            )}
          </div>
          <form
            className="w-full space-y-2 pt-2 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              void submitLink();
            }}
          >
            <label htmlFor="garment-link" className="block text-center text-sm text-muted">
              {t("garment.linkLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="garment-link"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-base text-ink focus:border-ink focus:outline-none"
              />
              <Button type="submit" variant="secondary" disabled={!link.trim() || linkBusy}>
                {linkBusy ? t("garment.linkLoading") : t("garment.linkGo")}
              </Button>
            </div>
          </form>
          {linkFound && (
            <div className="w-full space-y-2 text-left">
              <p className="text-sm text-ink">
                {linkFound.title && <span className="font-semibold">{linkFound.title} · </span>}
                {t("garment.linkPick")}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {linkFound.images.map((src) => (
                  <button
                    key={src}
                    type="button"
                    disabled={linkBusy}
                    onClick={() => pickLinkImage(src, linkFound)}
                    className="overflow-hidden rounded-xl border border-line bg-cream"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="aspect-[3/4] w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {analysis ? (
            <Button variant="ghost" onClick={keepCurrent}>
              {t("garment.keepCurrent")}
            </Button>
          ) : (
            onBack && (
              <Button variant="ghost" onClick={onBack}>
                {t("nav.back")}
              </Button>
            )
          )}
          {demos.length > 0 && (
            <div className="w-full pt-2">
              <p className="mb-3 text-sm text-muted">{t("garment.demo")}</p>
              <div className="grid grid-cols-4 gap-2">
                {demos.map((d) => (
                  <button key={d.src} onClick={() => pickDemo(d)} className="overflow-hidden rounded-xl border border-line bg-cream">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.src} alt={d.label} className="aspect-[3/4] w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {busy && (
        <Card className="space-y-4">
          <SkeletonImage ratio="4/3" />
          <Spinner label={stage === "isolating" ? t("garment.isolating") : t("garment.reading")} />
        </Card>
      )}

      {error && <ErrorNote onRetry={lastFile ? () => run(lastFile, analysis?.source) : undefined}>{error}</ErrorNote>}

      {analysis && attrs && !picking && (
        <>
          <Card className="space-y-4">
            <div className={analysis.isolatedUrl ? "grid grid-cols-2 gap-3" : "mx-auto max-w-[260px]"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={analysis.originalUrl} alt="" className="aspect-[3/4] w-full rounded-2xl bg-cream object-contain" />
              {analysis.isolatedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={analysis.isolatedUrl} alt="" className="checker aspect-[3/4] w-full rounded-2xl object-contain" />
              )}
            </div>
            {!analysis.isGarment && <ErrorNote>{t("garment.notAGarment")}</ErrorNote>}
            <div>
              <h2 className="text-sm font-semibold text-ink">{t("garment.colorTitle")}</h2>
              <p className="mb-3 text-xs text-muted">{t("garment.colorHint")}</p>
              <div className="flex flex-wrap gap-4">
                {analysis.clusters.map((c) => (
                  <Swatch
                    key={c.hex}
                    hex={c.hex}
                    size={44}
                    label={`${Math.round(c.share * 100)}%`}
                    selected={c.hex === colorHex}
                    onClick={() => setColorHex(c.hex)}
                  />
                ))}
              </div>
              {analysis.multicolor && <p className="mt-3 text-xs text-muted">{t("garment.multicolor")}</p>}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={pickAnother}>
                {t("garment.replace")}
              </Button>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <h2 className="font-display text-xl text-ink">{t("garment.detected")}</h2>
              <p className="text-sm text-muted">{t("garment.detectedHint")}</p>
            </div>
            {analysis.attrsSource === "default" && <Note>{t("garment.readerUnavailable")}</Note>}
            <ChipSelect
              label={t("garment.attrs.category")}
              value={attrs.category}
              options={opts("category", GARMENT_CATEGORIES)}
              onChange={(v) => set("category", v)}
              uncertain={attrs.uncertain.includes("category")}
            />
            {!isBottom && (
              <ChipSelect
                label={t("garment.attrs.neckline")}
                value={attrs.neckline}
                options={opts("neckline", NECKLINES.filter((n) => n !== "none"))}
                onChange={(v) => set("neckline", v)}
                uncertain={attrs.uncertain.includes("neckline")}
              />
            )}
            {!isBottom && (
              <ChipSelect
                label={t("garment.attrs.sleeves")}
                value={attrs.sleeves}
                options={opts("sleeves", SLEEVES.filter((n) => n !== "none"))}
                onChange={(v) => set("sleeves", v)}
                uncertain={attrs.uncertain.includes("sleeves")}
              />
            )}
            <ChipSelect
              label={t("garment.attrs.length")}
              value={attrs.length}
              options={opts("length", isTop ? TOP_LENGTHS : isBottom ? LONG_LENGTHS : LENGTHS.filter((l) => l !== "tunic"))}
              onChange={(v) => set("length", v)}
              uncertain={attrs.uncertain.includes("length")}
            />
            <ChipSelect
              label={t("garment.attrs.fit")}
              value={attrs.fit}
              options={opts("fit", FITS)}
              onChange={(v) => set("fit", v)}
              uncertain={attrs.uncertain.includes("fit")}
            />
            {!isBottom && (
              <ChipSelect
                label={t("garment.attrs.waist")}
                value={attrs.waist}
                options={opts("waist", WAISTS.filter((w) => w !== "high_waisted"))}
                onChange={(v) => set("waist", v)}
                uncertain={attrs.uncertain.includes("waist")}
              />
            )}
            {isBottom && (
              <ChipSelect
                label={t("garment.attrs.rise")}
                value={attrs.rise}
                options={opts("rise", RISES.filter((r) => r !== "na"))}
                onChange={(v) => set("rise", v)}
                uncertain={attrs.uncertain.includes("rise")}
              />
            )}
            {isBottom && (
              <ChipSelect
                label={t("garment.attrs.leg")}
                value={attrs.leg}
                options={opts("leg", LEGS)}
                onChange={(v) => set("leg", v)}
                uncertain={attrs.uncertain.includes("leg")}
              />
            )}
            <ChipSelect
              label={t("garment.attrs.pattern")}
              value={attrs.pattern}
              options={opts("pattern", PATTERNS)}
              onChange={(v) => set("pattern", v)}
              uncertain={attrs.uncertain.includes("pattern")}
            />
          </Card>

          <div className="flex justify-end">
            <Button onClick={confirm} disabled={!analysis.isGarment && analysis.attrsSource === "claude"}>
              {t("garment.confirm")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
