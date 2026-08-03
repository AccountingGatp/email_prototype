"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FolderOpen,
  Hourglass,
  MessageCircleWarning,
  VolumeX,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge, TagChip } from "@/components/status-badge";
import { PageLoader } from "@/components/loader";
import { api } from "@/lib/api";
import { relativeTime, senderFromParticipants } from "@/lib/format";
import type { Overview } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api<Overview>("/api/dashboard/overview")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const handler = () => load(true);
    window.addEventListener("et:mailbox-synced", handler);
    return () => window.removeEventListener("et:mailbox-synced", handler);
  }, [load]);

  if (loading && !data) {
    return (
      <AppShell>
        <PageLoader label="Loading overview…" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Could not load overview.</div>
      </AppShell>
    );
  }

  const tiles = [
    {
      label: "To Respond",
      value: data.toRespond,
      sub: "Needs our reply",
      href: "/inbox?awaiting=to_respond",
      icon: MessageCircleWarning,
      accent: "text-rose-700",
    },
    {
      label: "Waiting On Them",
      value: data.waiting,
      sub: "Awaiting client",
      href: "/inbox?awaiting=waiting",
      icon: Hourglass,
      accent: "text-amber-700",
    },
    {
      label: "Overdue",
      value: data.overdueCount ?? data.overdue,
      sub: `>${data.overdueBusinessDays || 2} business days`,
      href: "/inbox?overdueOnly=true",
      icon: AlertTriangle,
      accent: "text-rose-800",
    },
    {
      label: "Closed this week",
      value: data.closedThisWeek,
      sub: "Marked Done",
      href: "/inbox?awaiting=done",
      icon: CheckCircle2,
      accent: "text-emerald-700",
    },
    {
      label: "Unfiled",
      value: data.unfiled,
      sub: "No client/category",
      href: "/inbox?unfiled=true",
      icon: FolderOpen,
      accent: "text-slate-700",
    },
  ];

  const maxTrend = Math.max(
    1,
    ...data.trend.flatMap((t) => [t.opened, t.closed])
  );

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Accounting inbox health — open items, SLA, and noise
          </p>
        </div>
        <Link
          href="/inbox?overdueOnly=true"
          className="inline-flex h-8 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm text-rose-800 hover:bg-rose-100"
        >
          Escalation list
        </Link>
      </div>

      {data.oldestUnanswered && (
        <Link
          href={`/inbox?thread=${data.oldestUnanswered.id}`}
          className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/80 p-4 transition hover:bg-rose-50"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
              Oldest To Respond
            </div>
            <div className="truncate font-medium text-slate-900">
              {data.oldestUnanswered.subject}
            </div>
            <div className="text-xs text-slate-600">
              {senderFromParticipants(data.oldestUnanswered.participants)} ·{" "}
              {data.oldestUnanswered.ageBusinessDays != null
                ? `${data.oldestUnanswered.ageBusinessDays} business day(s)`
                : relativeTime(data.oldestUnanswered.firstIncomingAt)}
            </div>
          </div>
          <StatusBadge status={data.oldestUnanswered.status} />
        </Link>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm transition hover:border-teal-200 hover:shadow"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t.label}
              </span>
              <t.icon className={`h-4 w-4 ${t.accent}`} />
            </div>
            <div className={`mt-2 text-3xl tracking-tight ${t.accent}`}>{t.value}</div>
            <div className="mt-1 text-xs text-slate-500">{t.sub}</div>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Open vs closed (7 days)</h2>
          <div className="mt-4 flex items-end gap-2">
            {data.trend.map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-2 rounded-t bg-rose-400/80"
                    style={{ height: `${(day.opened / maxTrend) * 100}%` }}
                    title={`Opened ${day.opened}`}
                  />
                  <div
                    className="w-2 rounded-t bg-emerald-500/80"
                    style={{ height: `${(day.closed / maxTrend) * 100}%` }}
                    title={`Closed ${day.closed}`}
                  />
                </div>
                <span className="text-[10px] text-slate-400">
                  {day.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-rose-400" /> Opened
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Closed
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <VolumeX className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Noise check</h2>
          </div>
          <div className="mt-3 text-3xl text-slate-800">{data.noiseCount}</div>
          <p className="mt-1 text-xs text-slate-500">
            Auto-classified OTP / promo / digest threads excluded from open work
          </p>
          <Link
            href="/inbox?noise=true&awaiting=all"
            className="mt-3 inline-block text-xs text-teal-700 underline"
          >
            Review noise
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">By client (open)</h2>
          <div className="space-y-2">
            {data.byClient.slice(0, 8).map((c) => (
              <Link
                key={c.id}
                href={`/inbox?domain=${encodeURIComponent(c.domain)}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className="flex items-center gap-2 text-sm text-slate-800">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </span>
                <span className="text-xs text-slate-500">
                  {c.open ?? c.count} open · {c.toRespond ?? c.notReplied} to respond
                </span>
              </Link>
            ))}
            {!data.byClient.length && (
              <p className="text-sm text-slate-500">Add client domains to see this view.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">By tag</h2>
          <div className="flex flex-wrap gap-2">
            {data.byTag
              .filter((t) => t.count > 0)
              .slice(0, 16)
              .map((t) => (
                <Link key={t.id} href={`/inbox?tag=${t.id}`}>
                  <TagChip name={`${t.name} (${t.count})`} color={t.color} />
                </Link>
              ))}
            {!data.byTag.some((t) => t.count > 0) && (
              <p className="text-sm text-slate-500">No tagged open threads.</p>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            SLA: escalate To Respond after {data.overdueBusinessDays || 2} business days
          </div>
        </div>
      </div>
    </AppShell>
  );
}
