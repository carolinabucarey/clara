"use client";

// Browser Supabase client. Accounts are optional: without the public env vars the
// app works as before (nothing stored) and hides "Sign in".

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "clara";

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // PKCE so the Google popup can finish the sign-in on /auth/callback and the main tab picks it up.
  client = url && key ? createClient(url, key, { auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true } }) : null;
  return client;
}
