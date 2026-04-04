import { createClient } from "@supabase/supabase-js";

function getAdminConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SECRET_KEY;

  const hasPublicKey = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!url || !serviceRoleKey) {
    const missing: string[] = [];

    if (!url) {
      missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
    }

    if (!serviceRoleKey) {
      missing.push(
        "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE / SUPABASE_SECRET_KEY)",
      );
    }

    const serviceKeyHint = hasPublicKey && !serviceRoleKey
      ? " Public keys are configured, but server-side routes still require a service-role secret."
      : "";

    throw new Error(
      `Missing Supabase environment variables: ${missing.join(", ")}.${serviceKeyHint}`,
    );
  }

  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getAdminConfig();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
