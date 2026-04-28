import { createClient } from "@supabase/supabase-js";

const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  bucket: process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "materials",
};

let cachedSupabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  const missingSupabaseConfig = Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: supabaseConfig.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseConfig.anonKey,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingSupabaseConfig.length > 0) {
    throw new Error(`Missing Supabase config values: ${missingSupabaseConfig.join(", ")}`);
  }

  cachedSupabase ??= createClient(
    supabaseConfig.url as string,
    supabaseConfig.anonKey as string,
  );
  return cachedSupabase;
}

export const supabaseBucket = supabaseConfig.bucket;
