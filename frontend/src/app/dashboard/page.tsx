"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, MailOpen, MessageSquareReply, Percent } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StatusBadge, TagChip } from "@/components/status-badge";
import { api } from "@/lib/api";
import { formatReplyTime, relativeTime, senderFromParticipants } from "@/lib/format";
import type { Overview, ThreadStatus } from "@/lib/types";
import { useRealtime } from "@/hooks/use-realtime";

export default function DashboardPage() {
  const [data, setData] = useState<Overview | null>(null);

  const load = useCallback(() => {
    api<Overview>("/api/dashboard/overview").then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  if (!data) {
    return (
      <AppShell>
        <div className="text-sm text-slate-500">Loading overview…</div>
      </AppShell>
    );
  }

  const stats = [
    {
      label: "Received today",
      value: data.totalToday,
      sub: `${data.totalWeek} this week`,
      icon: MailOpen,
    },
    {
      label: "Replied",
      value: `${data.repliedPercent}%`,
      sub: `${data.replied} of ${data.total} threads`,
      icon: MessageSquareReply,
    },
    {
      label: "Not replied",
      value: data.notReplied,
      sub: `${data.overdueCount} past ${data.thresholdHours}h`,
      icon: Percent,
    },
    {
      label: "Avg reply time",
      value: formatReplyTime(data.avgReplyTimeSeconds),
      sub: "first response",
      icon: Clock,
    },
  ];

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Shared inbox health across clients and projects
          </p>
        </div>
        <Link
          href="/inbox?unansweredOnly=true"
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm hover:bg-slate-50"
        >
          View unanswered
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
              Oldest unanswered
            </div>
            <div className="mt-1 truncate font-medium text-slate-900">
              {data.oldestUnanswered.subject}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              From {senderFromParticipants(data.oldestUnanswered.participants)} · waiting{" "}
              {relativeTime(data.oldestUnanswered.firstIncomingAt)}
            </div>
          </div>
          <StatusBadge status={data.oldestUnanswered.status} />
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {s.label}
                </span>
                <Icon className="h-4 w-4 text-teal-700" />
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-slate-500">{s.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg text-slate-900">By suffix / tag</h2>
          <p className="mb-4 text-sm text-slate-500">Volume per client or project tag</p>
          <div className="space-y-3">
            {data.byTag.map((t) => {
              const max = Math.max(...data.byTag.map((x) => x.count), 1);
              return (
                <div key={t.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <TagChip name={t.name} color={t.color} />
                    <span className="text-slate-600">{t.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(t.count / max) * 100}%`,
                        backgroundColor: t.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
          <h2 className="text-lg text-slate-900">Status mix</h2>
          <p className="mb-4 text-sm text-slate-500">Current thread distribution</p>
          <div className="space-y-3">
            {Object.entries(data.byStatus).map(([status, count]) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
              >
                <StatusBadge status={status as ThreadStatus} />
                <span className="text-sm font-medium text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
