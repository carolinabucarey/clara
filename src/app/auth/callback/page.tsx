"use client";

// Where the email link comes back, in a new tab. The Supabase client finishes the
// PKCE exchange on load, the session reaches the Clara tab that asked for it, and
// this page says where to go next.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { supabase } from "@/lib/supabase/client";
import { ClaraAvatar } from "@/components/ui";

export default function AuthCallback() {
  const { t } = useI18n();
  const [state, setState] = useState<"working" | "done" | "failed">("working");

  useEffect(() => {
    let alive = true;
    const sb = supabase();
    if (!sb) {
      window.location.replace("/");
      return;
    }
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setState(data.session ? "done" : "failed");
    }).catch(() => { if (alive) setState("failed"); });
    return () => { alive = false; };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <ClaraAvatar size={64} />
      {state === "working" ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-clay" aria-label="…" />
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-ink">{state === "done" ? t("account.callbackDone") : t("account.callbackFailed")}</p>
          <Link href="/" className="text-sm font-semibold text-clay underline-offset-4 hover:underline">
            {t("account.backToClara")}
          </Link>
        </>
      )}
    </main>
  );
}
