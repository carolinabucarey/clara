"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { AccountError, sendEmailCode, verifyEmailCode } from "@/lib/account/session";
import { Button, ErrorNote } from "./ui";

const input = "h-11 w-full rounded-xl border border-line bg-paper px-3 text-base text-ink focus:border-ink focus:outline-none";

/**
 * Sign in without leaving the page: an email link (opened in another tab), or a
 * code when the email template includes one.
 * When opened to save a look, it also asks whether to keep the photos.
 */
export function AuthDialog({
  open,
  onClose,
  consent,
}: {
  open: boolean;
  onClose: () => void;
  consent?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(t(`account.errors.${e instanceof AccountError && e.code !== "disabled" ? e.code : "generic"}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-3xl border border-line bg-paper p-0 text-ink shadow-xl backdrop:bg-ink/40"
    >
      <form
        method="dialog"
        className="space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            if (!sent) {
              await sendEmailCode(email.trim());
              setSent(true);
            } else {
              await verifyEmailCode(email.trim(), code);
            }
          });
        }}
      >
        <div>
          <h2 className="font-display text-2xl">{t("account.dialogTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("account.dialogBody")}</p>
        </div>

        {!sent ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">{t("account.email")}</span>
            <input
              className={input}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        ) : (
          <div className="space-y-2">
            <p className="rounded-2xl bg-sage-soft px-3 py-2.5 text-sm text-ink">{t("account.linkSent", { email })}</p>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">{t("account.code")}</span>
              <input
                className={`${input} tracking-[0.4em]`}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,8}"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <button
              type="button"
              className="text-sm font-semibold text-clay underline-offset-4 hover:underline"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              {t("account.otherEmail")}
            </button>
          </div>
        )}

        {consent && (
          <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={consent.checked}
              onChange={(e) => consent.onChange(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--clay)]"
            />
            {t("account.consent")}
          </label>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("account.cancel")}
          </Button>
          <Button type="submit" disabled={busy || (sent && code.length < 6)}>
            {sent ? t("account.verify") : t("account.sendCode")}
          </Button>
        </div>

      </form>
    </dialog>
  );
}
