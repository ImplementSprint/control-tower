import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { RepoTribeMap } from "@/lib/supabase/types";
import { TribeActions } from "./tribe-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

async function getTribes(): Promise<RepoTribeMap[]> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("repo_tribe_map")
    .select("repository, tribe, is_active, created_at, updated_at")
    .order("tribe", { ascending: true });
  return (data ?? []) as RepoTribeMap[];
}

export default async function TribesPage() {
  const tribes = await getTribes();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tribe Mappings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Repository-to-tribe assignments. Repos not listed are resolved by naming convention.
          </p>
        </div>
        <TribeActions tribes={tribes} />
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {tribes.length} mapping{tribes.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tribes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No explicit mappings yet. Repos are resolved by naming convention.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Repository</th>
                    <th className="pb-2 pr-4 font-medium">Tribe</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {tribes.map((t) => (
                    <tr key={t.repository} className="group">
                      <td className="py-2.5 pr-4 font-mono text-xs">{t.repository}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="rounded-full text-xs">
                          {t.tribe}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.is_active
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {formatRelativeTime(t.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
