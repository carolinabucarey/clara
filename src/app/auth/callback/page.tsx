"use client";

// Where the email link comes back, in a new tab. The Supabase client finishes the
// PKCE exchange on load, the session reaches the Clara tab that asked for it, and
// this page says where to go next.
//
// The exchange needs the verifier the asking browser stored, so a link opened on another
// device (or in an email app's own browser) can't sign in here, and the look waiting in the
// first tab stays unsaved. The client then skips the exchange without an error and the
// ?code= stays in the URL: this page tells the person to go back to where they asked.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { supabase } from "@/lib/supabase/client";
import { ClaraAvatar } from "@/components/ui";

export default function AuthCallback() {
  const { t } = useI18n();
  const [state, setState] = useState<"working" | "done" | "otherDevice" | "expired" | "failed">("working");

  useEffect(() => {
    let alive = true;
    // Read before the client handles the URL (a successful exchange removes the code).
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hadCode = query.has("code");
    const urlError = query.get("error_code") ?? hash.get("error_code");
    const sb = supabase();
    if (!sb) {
      window.location.replace("/");
      return;
    }
    (async () => {
      const { error } = await sb.auth.initialize();
      const { data } = await sb.auth.getSession();
      if (!alive) return;
      if (data.session) setState("done");
      else if (urlError === "otp_expired") setState("expired");
      else if (hadCode && !error && !urlError) setState("otherDevice");
      else setState("failed");
    })().catch(() => { if (alive) setState("failed"); });
    return () => { alive = false; };
  }, []);

  const message = {
    done: "account.callbackDone",
    otherDevice: "account.callbackOtherDevice",
    expired: "account.callbackExpired",
    failed: "account.callbackFailed",
  } as const;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <ClaraAvatar size={64} />
      {state === "working" ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-clay" aria-label="…" />
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-ink">{t(message[state])}</p>
          <Link href="/" className="text-sm font-semibold text-clay underline-offset-4 hover:underline">
            {t("account.backToClara")}
          </Link>
        </>
      )}
    </main>
  );
}
