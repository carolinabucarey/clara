"use client";

// Where Google sends the sign-in popup back. The Supabase client finishes the PKCE
// exchange on load; the session reaches the main tab and this window closes.

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function AuthCallback() {
  useEffect(() => {
    const done = () => {
      if (window.opener) window.close();
      else window.location.replace("/");
    };
    const sb = supabase();
    if (!sb) return done();
    sb.auth.getSession().finally(done);
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-clay" aria-hidden />
    </main>
  );
}
