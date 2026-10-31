"use client";

// Who is signed in, and the sign-in methods: an email (a link, or a 6-digit code when
// the template includes one) or Google in a popup. Both keep this page as it is.

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseConfig } from "../supabase/client";

export function useAccount(onUserChange?: (user: User | null) => void): {
  enabled: boolean;
  ready: boolean;
  user: User | null;
} {
  const sb = supabase();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!sb);
  const latest = useRef(onUserChange);
  useEffect(() => {
    latest.current = onUserChange;
  });
  useEffect(() => {
    if (!sb) return;
    // Fires INITIAL_SESSION on subscribe, then on every sign-in/out (also from other tabs).
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      setReady(true);
      // Supabase calls made inside this callback can deadlock: run the handler afterwards.
      setTimeout(() => latest.current?.(next), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);
  return { enabled: !!sb, ready, user };
}

let googleEnabled: Promise<boolean> | null = null;

/** Whether Google sign-in is turned on in the Supabase project (public auth settings). */
export function useGoogleSignIn(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const config = supabaseConfig();
    if (!config) return;
    googleEnabled ??= fetch(`${config.url}/auth/v1/settings`, { headers: { apikey: config.key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { external?: { google?: boolean } } | null) => d?.external?.google === true)
      .catch(() => false);
    let alive = true;
    googleEnabled.then((on) => alive && setEnabled(on));
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}

export class AccountError extends Error {
  constructor(public code: "invalidEmail" | "invalidCode" | "rateLimited" | "generic" | "disabled") {
    super(code);
    this.name = "AccountError";
  }
}

function client() {
  const sb = supabase();
  if (!sb) throw new AccountError("disabled");
  return sb;
}

function authError(err: { status?: number; code?: string; message?: string }, fallback: AccountError["code"]) {
  if (err.status === 429 || /rate/i.test(err.code ?? "")) return new AccountError("rateLimited");
  if (/email/i.test(err.code ?? "") && /invalid/i.test(err.code ?? err.message ?? "")) return new AccountError("invalidEmail");
  return new AccountError(fallback);
}

export async function sendEmailCode(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError("invalidEmail");
  // Supabase's default email (no custom SMTP) carries a link, not a code: the link opens /auth/callback
  // in a new tab of this browser and the session reaches this tab, so nothing in progress is lost.
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw authError(error, "generic");
}

export async function verifyEmailCode(email: string, token: string) {
  const { error } = await client().auth.verifyOtp({ email, token: token.trim(), type: "email" });
  if (error) throw authError(error, "invalidCode");
}

/** Google sign-in in a popup; /auth/callback completes it and the session reaches this tab. */
export async function signInWithGoogle() {
  const { data, error } = await client().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new AccountError("generic");
  const popup = window.open(data.url, "clara-sign-in", "width=480,height=640");
  if (!popup) window.location.assign(data.url); // popup blocked: a full redirect still works
}

export async function signOut() {
  await supabase()?.auth.signOut();
}

/** Deletes the auth user (and, by cascade, every row) on the server; files go first. */
export async function deleteAccount() {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AccountError("generic");
  const res = await fetch("/api/account", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new AccountError("generic");
  await client().auth.signOut();
}
