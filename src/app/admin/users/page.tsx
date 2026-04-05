import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/formatters";
import { UserActions } from "./user-actions";

export const dynamic = "force-dynamic";

type MembershipWithUser = {
  id: string;
  user_id: string;
  tribe: string;
  role: "viewer" | "lead" | "platform_admin";
  is_active: boolean;
  updated_at: string;
  email: string | null;
  github_username: string | null;
};

async function getMemberships(): Promise<MembershipWithUser[]> {
  const supabase = createSupabaseAdminClient();

  const [membershipsResult, usersResult] = await Promise.all([
    supabase
      .from("user_tribe_membership")
      .select("id, user_id, tribe, role, is_active, updated_at")
      .order("updated_at", { ascending: false }),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const userMap = new Map(
    (usersResult.data?.users ?? []).map((u) => [
      u.id,
      {
        email: u.email ?? null,
        github_username:
          (u.user_metadata?.user_name as string | undefined) ??
          (u.user_metadata?.preferred_username as string | undefined) ??
          null,
      },
    ]),
  );

  return (membershipsResult.data ?? []).map((m) => ({
    ...m,
    role: m.role as MembershipWithUser["role"],
    email: userMap.get(m.user_id)?.email ?? null,
    github_username: userMap.get(m.user_id)?.github_username ?? null,
  }));
}

const roleColors: Record<string, string> = {
  platform_admin: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  lead: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-muted text-muted-foreground",
};

export default async function UsersPage() {
  const memberships = await getMemberships();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Memberships</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tribe assignments and roles for all users.
          </p>
        </div>
        <UserActions />
      </div>

      <Card className="rounded-2xl border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {memberships.length} membership{memberships.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No memberships found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">User</th>
                    <th className="pb-2 pr-4 font-medium">Tribe</th>
                    <th className="pb-2 pr-4 font-medium">Role</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {memberships.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-4">
                        <div className="text-xs font-medium">{m.github_username ?? m.email ?? m.user_id.slice(0, 8)}</div>
                        {m.email && m.github_username && (
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className="rounded-full text-xs">{m.tribe}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleColors[m.role] ?? roleColors.viewer}`}>
                          {m.role}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                          {m.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {formatRelativeTime(m.updated_at)}
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
