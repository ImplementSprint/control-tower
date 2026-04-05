"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, GitBranch, Shield, Bell, LayoutDashboard } from "lucide-react";

const navItems = [
  { href: "/admin/tribes", label: "Tribes", icon: GitBranch },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/policies", label: "Policies", icon: Shield },
  { href: "/admin/alerts", label: "Alerts", icon: Bell },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-border/60 px-4 pb-3 pt-2 sm:px-6">
      <Link
        href="/"
        className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        <LayoutDashboard className="size-3.5" />
        Dashboard
      </Link>

      <span className="mr-2 text-border/60">/</span>

      <span className="mr-3 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
        Admin
      </span>

      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "border border-border/60 text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
