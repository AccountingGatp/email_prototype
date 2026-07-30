"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StatusBadge, TagChip } from "@/components/status-badge";
import { api } from "@/lib/api";
import { formatReplyTime, relativeTime, senderFromParticipants } from "@/lib/format";
import type { LeaderboardEntry, Thread } from "@/lib/types";
import { useRealtime } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

export default function TeamPage() {
  const [range, setRange] = useState<"today" | "week">("week");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ range });
    if (userId) qs.set("userId", userId);
    api<{ leaderboard: LeaderboardEntry[]; threads: Thread[] }>(
      `/api/dashboard/team?${qs}`
    ).then((r) => {
      setLeaderboard(r.leaderboard);
      setThreads(r.threads);
    });
  }, [range, userId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime(load);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight text-slate-900">Team accountability</h1>
          <p className="mt-1 text-sm text-slate-500">
            Who handled what — replies, open assignments, and volume
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(["today", "week"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize",
                range === r ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {leaderboard.map((entry, i) => (
          <button
            key={entry.user.id}
            type="button"
            onClick={() => setUserId(entry.user.id === userId ? null : entry.user.id)}
            className={cn(
              "rounded-xl border p-4 text-left shadow-sm transition",
              userId === entry.user.id
                ? "border-teal-400 bg-teal-50"
                : "border-slate-200/80 bg-white/90 hover:border-teal-200"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">#{i + 1}</span>
              <span className="text-2xl font-semibold text-slate-900">{entry.replies}</span>
            </div>
            <div className="mt-1 font-medium text-slate-900">{entry.user.name}</div>
            <div className="text-xs text-slate-500">{entry.user.email}</div>
            <div className="mt-3 flex justify-between text-xs text-slate-600">
              <span>{entry.assignedOpen} open assigned</span>
              <span>avg {formatReplyTime(entry.avgReplyTimeSeconds)}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
        <h2 className="text-lg text-slate-900">
          {userId
            ? `Emails replied to by ${leaderboard.find((e) => e.user.id === userId)?.user.name}`
            : "Select a teammate to see their replies"}
        </h2>
        <div className="mt-4 divide-y divide-slate-100">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/inbox?thread=${t.id}`}
              className="flex items-start justify-between gap-3 py-3 hover:bg-slate-50/80"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900">{t.subject}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {senderFromParticipants(t.participants)} · {relativeTime(t.latestMessageAt)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge status={t.status} />
                  {t.tags.map((tag) => (
                    <TagChip key={tag.id} name={tag.name} color={tag.color} />
                  ))}
                </div>
              </div>
            </Link>
          ))}
          {userId && !threads.length && (
            <div className="py-8 text-center text-sm text-slate-500">No replies in this range.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
