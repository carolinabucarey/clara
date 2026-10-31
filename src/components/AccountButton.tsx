"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useI18n } from "@/lib/i18n/context";
import { cx } from "./ui";

/** Header entry point: "Sign in", or the person's initial with their account menu. */
export function AccountButton({
  user,
  onSignIn,
  onMyLooks,
  onDeleteData,
  onDeleteAccount,
  onSignOut,
}: {
  user: User | null;
  onSignIn: () => void;
  onMyLooks: () => void;
  onDeleteData: () => void;
  onDeleteAccount: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const pill = "min-h-9 rounded-full border border-line bg-paper px-3 text-xs font-semibold text-ink hover:border-ink/40";
  if (!user) {
    return (
      <button onClick={onSignIn} className={pill}>
        {t("account.signIn")}
      </button>
    );
  }

  const item = "block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-cream";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("account.menu")}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-semibold uppercase text-cream"
      >
        {(user.email ?? "?").charAt(0)}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-2xl border border-line bg-paper p-1.5 shadow-lg">
          <p className="truncate px-3 py-2 text-xs text-muted">{user.email}</p>
          <button className={item} onClick={run(onMyLooks)}>
            {t("nav.myLooks")}
          </button>
          <button className={item} onClick={run(onSignOut)}>
            {t("account.signOut")}
          </button>
          <div className="my-1 h-px bg-line" />
          <button className={cx(item, "text-rose")} onClick={run(onDeleteData)}>
            {t("account.deleteData")}
          </button>
          <button className={cx(item, "text-rose")} onClick={run(onDeleteAccount)}>
            {t("account.deleteAccount")}
          </button>
        </div>
      )}
    </div>
  );
}
