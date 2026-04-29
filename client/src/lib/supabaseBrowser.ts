import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Phase C4: browser-side Supabase client.
//
// Uses the publishable anon key (browser-safe). Sessions persist via
// localStorage and the SDK auto-refreshes the JWT. `detectSessionInUrl`
// handles the OAuth redirect callback for `signInWithOAuth({provider: 'google'})`.
//
// Same Supabase project as coaching-log (https://zwvrtxxgctyyctirntzj.supabase.co)
// — both apps share auth.users + public.profiles.

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !anonKey) {
  // Don't throw — let the app render in a "not configured" state so a misconfigured
  // preview build still loads the LoginPage and prints a friendly message.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabaseBrowser] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing. " +
      "Add them to .env.local for local dev or Vercel Project env for prod."
  );
}

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const isSupabaseConfigured = !!supabase;
