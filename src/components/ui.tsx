"use client";

import { useId, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Confidence, Evidence, OutfitVerdict, Verdict } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { canShareFiles, shareImage } from "@/lib/share";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-ink text-cream hover:bg-ink/90",
        variant === "secondary" && "border border-line bg-paper text-ink hover:border-ink/40",
        variant === "ghost" && "text-muted underline-offset-4 hover:text-ink hover:underline",
        className,
      )}
    />
  );
}

// Pre-rendered sizes in public/avatars/clara-circular-{size}.webp.
const AVATAR_SIZES = [24, 32, 40, 48, 64, 96, 128, 192, 256, 512, 1024];

/** Clara's circular avatar, served from the closest pre-rendered size (1x and 2x). */
export function ClaraAvatar({ size = 40, className }: { size?: number; className?: string }) {
  const pick = (px: number) => AVATAR_SIZES.find((s) => s >= px) ?? AVATAR_SIZES[AVATAR_SIZES.length - 1];
  const src = (px: number) => `/avatars/clara-circular-${pick(px)}.webp`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src(size)}
      srcSet={`${src(size)} 1x, ${src(size * 2)} 2x`}
      width={size}
      height={size}
      alt="Clara"
      className={cx("shrink-0 rounded-full", className)}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-3xl border border-line bg-paper p-5 shadow-sm", className)}>{children}</section>;
}

export function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}
    </header>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-clay" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-rose-soft px-4 py-3 text-sm text-rose">
      <span className="flex-1">{children}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-4">
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-sand/70 px-4 py-3 text-sm leading-relaxed text-muted">{children}</p>;
}

const noSubscribe = () => () => {};

/**
 * Draws a share card on tap and opens the share sheet, or downloads the image where
 * the browser has none. Sits in a wrapping row of buttons: the error takes a full line.
 */
export function ShareButton({
  render,
  filename,
  variant = "secondary",
}: {
  render: () => Promise<Blob>;
  filename: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const { t } = useI18n();
  const canShare = useSyncExternalStore(noSubscribe, canShareFiles, () => false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const share = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await shareImage(await render(), filename);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant={variant} onClick={share} disabled={busy}>
        {busy ? t("share.preparing") : canShare ? t("share.share") : t("share.download")}
      </Button>
      {failed && (
        <div className="basis-full">
          <ErrorNote onRetry={share}>{t("errors.generic")}</ErrorNote>
        </div>
      )}
    </>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  flatters: "bg-sage-soft text-sage",
  works_with_tweaks: "bg-amber-soft text-amber",
  not_flattering: "bg-rose-soft text-rose",
};
const VERDICT_DOT: Record<Verdict, string> = {
  flatters: "bg-sage",
  works_with_tweaks: "bg-amber",
  not_flattering: "bg-rose",
};

export function VerdictPill({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const { t } = useI18n();
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full font-semibold",
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
        VERDICT_STYLE[verdict],
      )}
    >
      <span className={cx("h-2 w-2 rounded-full", VERDICT_DOT[verdict])} aria-hidden />
      {t(`verdict.levels.${verdict}`)}
    </span>
  );
}

const OUTFIT_TONE: Record<OutfitVerdict, Verdict> = {
  works_together: "flatters",
  works_with_tweaks: "works_with_tweaks",
  clash: "not_flattering",
};

export function OutfitPill({ verdict }: { verdict: OutfitVerdict }) {
  const { t } = useI18n();
  const tone = OUTFIT_TONE[verdict];
  return (
    <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold", VERDICT_STYLE[tone])}>
      <span className={cx("h-2 w-2 rounded-full", VERDICT_DOT[tone])} aria-hidden />
      {t(`look.levels.${verdict}`)}
    </span>
  );
}

/** Evidence lines with their +/− marks, as shown under every verdict. */
export function EvidenceList({ items, render }: { items: Evidence[]; render: (e: Evidence) => string }) {
  return (
    <ul className="space-y-2">
      {items.map((e, i) => (
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
          {render(e)}
        </li>
      ))}
    </ul>
  );
}

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const { t } = useI18n();
  const bars = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={t("common.confidence")}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx("w-1 rounded-sm", i <= bars ? "bg-ink/70" : "bg-line")} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {t("common.confidence")}: {t(`common.confidenceLevels.${level}`)}
    </span>
  );
}

export function Swatch({ hex, label, size = 36, selected, onClick }: {
  hex: string;
  label?: string;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <span
      className={cx("block rounded-full border border-black/10", selected && "ring-2 ring-ink ring-offset-2")}
      style={{ width: size, height: size, background: hex }}
    />
  );
  return (
    <span className="inline-flex flex-col items-center gap-1">
      {onClick ? (
        <button type="button" onClick={onClick} aria-pressed={selected} aria-label={`${label ?? ""} ${hex}`} className="rounded-full">
          {inner}
        </button>
      ) : (
        inner
      )}
      {label && <span className="text-[11px] text-muted">{label}</span>}
      <span className="font-mono text-[10px] uppercase text-muted/80">{hex}</span>
    </span>
  );
}

/** A row of mutually exclusive chips, used for every user correction. */
export function ChipSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  uncertain,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  uncertain?: boolean;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id} className="space-y-1.5">
      <div id={id} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
        {uncertain && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] normal-case tracking-normal text-amber">?</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            tabIndex={o.value === value || (!options.some((option) => option.value === value) && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!delta && e.key !== "Home" && e.key !== "End") return;
              e.preventDefault();
              const next = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : (i + delta + options.length) % options.length;
              onChange(options[next].value);
              e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}
            className={cx(
              "min-h-9 rounded-full border px-3 text-sm transition",
              o.value === value ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink hover:border-ink/40",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilePicker({
  label,
  onFile,
  variant = "primary",
  className,
}: {
  label: string;
  onFile: (f: File) => void;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        aria-label={label}
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button type="button" variant={variant} className={className} onClick={() => ref.current?.click()}>
        {label}
      </Button>
    </>
  );
}

export function SkeletonImage({ ratio = "3/4", label }: { ratio?: string; label?: string }) {
  return (
    <div className="shimmer flex w-full items-end justify-center rounded-2xl p-3" style={{ aspectRatio: ratio }}>
      {label && <Spinner label={label} />}
    </div>
  );
}
