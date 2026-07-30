"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Users,
  Tags,
  Settings,
  LogOut,
  Mail,
  Bell,
  Globe2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/domains", label: "Client domains", icon: Globe2 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--app-bg)]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-teal-700 border-t-transparent" />
        <p className="text-sm text-slate-500">Loading workspace…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--app-bg)] text-slate-900">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200/80 bg-[#0f1f24] text-slate-100">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="font-[family-name:var(--font-display)] text-lg leading-none tracking-tight">
              InboxLens
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Shared inbox tracker</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-teal-500/15 text-teal-200"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Separator className="bg-white/10" />
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-teal-800 text-xs text-teal-100">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{user.email}</div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={() => {
              logout();
              router.push("/login");
            }}
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/80 px-6 backdrop-blur">
          <div className="text-sm text-slate-500">
            Shared inbox · <span className="text-slate-800">support@company.com</span>
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <Bell className="h-4 w-4" />
            <span className="text-xs">Live sync on</span>
            <span className="h-2 w-2 animate-pulse rounded-full bg-teal-500" />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
