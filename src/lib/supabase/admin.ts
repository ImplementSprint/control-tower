import { createClient } from "@supabase/supabase-js";

function getAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE;

  const hasPublicKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url || !secretKey) {
    const missing: string[] = [];

    if (!url) {
      missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    }

    if (!secretKey) {
      missing.push(
        "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE)",
      );
    }

    const serviceKeyHint = hasPublicKey && !secretKey
      ? " Publishable keys are configured, but privileged server routes still require a secret key."
      : "";

    throw new Error(
      `Missing Supabase environment variables: ${missing.join(", ")}.${serviceKeyHint}`,
    );
  }

  return { url, secretKey };
}

export function createSupabaseAdminClient() {
  const { url, secretKey } = getAdminConfig();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
