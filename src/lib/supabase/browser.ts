import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabasePublicConfig } from "@/lib/config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = resolveSupabasePublicConfig();

  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}
