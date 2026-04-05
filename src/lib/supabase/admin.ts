import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseAdminConfig } from "@/lib/config";

export function createSupabaseAdminClient() {
  const { url, secretKey } = resolveSupabaseAdminConfig();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
