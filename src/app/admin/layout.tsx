import { redirect } from "next/navigation";
import { getAuthenticatedAccessScope } from "@/lib/auth/access";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const accessScope = await getAuthenticatedAccessScope();

  if (!accessScope) {
    redirect("/auth/login?next=/admin");
  }

  if (!accessScope.isPlatformAdmin) {
    redirect("/");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-[oklch(0.94_0.06_54_/_0.8)] blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-12 h-80 w-80 rounded-full bg-[oklch(0.93_0.08_124_/_0.75)] blur-3xl" />

      <div className="relative">
        <AdminNav />
        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
