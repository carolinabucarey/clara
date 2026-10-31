"use client";

// Browser Supabase client. Accounts are optional: without the public env vars the
// app works as before (nothing stored) and hides "Sign in".

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "clara";

let client: SupabaseClient | null | undefined;

export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const config = supabaseConfig();
  // PKCE so the email link and the Google popup finish on /auth/callback and this tab picks it up.
  client = config
    ? createClient(config.url, config.key, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } })
    : null;
  return client;
}
