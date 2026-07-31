"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, Search, Send, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { StatusBadge, TagChip } from "@/components/status-badge";
import { api } from "@/lib/api";
import {
  formatDateTime,
  formatReplyTime,
  relativeTime,
  senderFromParticipants,
  domainFromEmail,
} from "@/lib/format";
import type { Message, Tag, Thread, ThreadStatus, User } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { useRealtime } from "@/hooks/use-realtime";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InlineLoader, OverlayLoader, Spinner } from "@/components/loader";
import { EmailBody } from "@/components/email-body";
import { cn } from "@/lib/utils";

type AwaitingFilter = "us" | "client" | "all";

type Filters = {
  q: string;
  status: string;
  awaiting: AwaitingFilter;
  tag: string;
  repliedBy: string;
  sender: string;
  domains: string[];
  unansweredOnly: boolean;
};

const AWAITING_OPTIONS: { value: AwaitingFilter; label: string; hint: string }[] = [
  { value: "us", label: "We didn't reply", hint: "Needs our response" },
  { value: "client", label: "Client didn't reply", hint: "Waiting on client" },
  { value: "all", label: "All", hint: "Every thread" },
];

function parseDomainsParam(raw: string | null) {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((d) => d.trim().replace(/^@/, "").toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export default function InboxPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<{ domain: string; count: number }[]>([]);
  const [savedFilters, setSavedFilters] = useState<
    { id: string; name: string; domain: string; color: string; threadCount?: number }[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("thread")
  );
  const [detail, setDetail] = useState<{ thread: Thread; messages: Message[] } | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sharedInboxEmail, setSharedInboxEmail] = useState("");
  const [filters, setFilters] = useState<Filters>(() => {
    const awaitingParam = searchParams.get("awaiting");
    const awaiting: AwaitingFilter =
      awaitingParam === "client" || awaitingParam === "all" || awaitingParam === "us"
        ? awaitingParam
        : "us";
    return {
      q: "",
      status: "",
      awaiting,
      tag: searchParams.get("tag") || "",
      repliedBy: "",
      sender: searchParams.get("sender") || "",
      domains: parseDomainsParam(searchParams.get("domain")),
      unansweredOnly: searchParams.get("unansweredOnly") === "true",
    };
  });

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.status) p.set("status", filters.status);
    else if (filters.awaiting !== "all") p.set("awaiting", filters.awaiting);
    if (filters.tag) p.set("tag", filters.tag);
    if (filters.repliedBy) p.set("repliedBy", filters.repliedBy);
    if (filters.sender) p.set("sender", filters.sender);
    if (filters.domains.length) p.set("domain", filters.domains.join(","));
    if (filters.unansweredOnly) p.set("unansweredOnly", "true");
    p.set("sort", "oldest_unanswered");
    return p.toString();
  }, [filters]);

  function toggleDomain(domain: string) {
    const d = domain.replace(/^@/, "").toLowerCase();
    setFilters((prev) => {
      const has = prev.domains.includes(d);
      return {
        ...prev,
        domains: has ? prev.domains.filter((x) => x !== d) : [...prev.domains, d],
      };
    });
  }

  const loadThreads = useCallback((silent = false) => {
    if (!silent) setLoadingThreads(true);
    api<{ threads: Thread[] }>(`/api/threads?${queryString}`)
      .then((r) => setThreads(r.threads))
      .catch((e) => toast.error(e.message))
      .finally(() => {
        if (!silent) setLoadingThreads(false);
      });
  }, [queryString]);

  const loadMeta = useCallback(() => {
    Promise.all([
      api<{ tags: Tag[] }>("/api/tags"),
      api<{ users: User[] }>("/api/auth/users"),
      api<{ domains: { domain: string; count: number }[] }>("/api/threads/meta/domains"),
      api<{
        filters: {
          id: string;
          name: string;
          domain: string;
          color: string;
          threadCount?: number;
        }[];
      }>("/api/domain-filters"),
      api<{ settings: Record<string, string> }>("/api/settings").catch(() => ({
        settings: {},
      })),
    ]).then(([t, u, d, f, s]) => {
      setTags(t.tags);
      setUsers(u.users);
      setDomains(d.domains);
      setSavedFilters(f.filters);
      if (s.settings?.shared_inbox_email) {
        setSharedInboxEmail(s.settings.shared_inbox_email);
      }
    });
  }, []);

  function threadShareUrl(threadId: string) {
    const path = `/inbox?thread=${encodeURIComponent(threadId)}`;
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  function gmailOpenUrl(externalId?: string | null) {
    if (!externalId || externalId.startsWith("ext_") || externalId.startsWith("msg_")) {
      return null;
    }
    const base = sharedInboxEmail
      ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(sharedInboxEmail)}`
      : "https://mail.google.com/mail/u/0";
    return `${base}#all/${externalId}`;
  }

  async function copyThreadLink(threadId: string) {
    const url = threadShareUrl(threadId);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Thread link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  const loadDetail = useCallback((id: string) => {
    setLoadingDetail(true);
    api<{ thread: Thread; messages: Message[] }>(`/api/threads/${id}`)
      .then(setDetail)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingDetail(false));
  }, []);

  useEffect(() => {
    loadThreads(false);
    loadMeta();
  }, [loadThreads, loadMeta]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const onSync = useCallback(() => {
    loadThreads(true);
    if (selectedId) loadDetail(selectedId);
  }, [loadThreads, loadDetail, selectedId]);
  useRealtime(onSync);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api<{ synced: number }>("/api/sync", { method: "POST" });
      toast.success(r.synced ? `Synced ${r.synced} new message(s)` : "Inbox up to date");
      onSync();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    try {
      await api(`/api/threads/${selectedId}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      });
      setReply("");
      toast.success("Reply recorded");
      onSync();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reply");
    } finally {
      setSending(false);
    }
  }

  async function assign(userId: string | null) {
    if (!selectedId) return;
    await api(`/api/threads/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify({ assignedTo: userId }),
    });
    onSync();
  }

  async function setStatus(status: ThreadStatus) {
    if (!selectedId) return;
    await api(`/api/threads/${selectedId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    onSync();
  }

  async function addTag(tagId: string) {
    if (!selectedId) return;
    await api(`/api/threads/${selectedId}/tags`, {
      method: "POST",
      body: JSON.stringify({ tagId }),
    });
    onSync();
  }

  async function removeTag(tagId: string) {
    if (!selectedId) return;
    await api(`/api/threads/${selectedId}/tags/${tagId}`, { method: "DELETE" });
    onSync();
  }

  async function bulkApplyTag(tagId: string) {
    const ids = [...selectedIds];
    if (!ids.length) return toast.error("Select threads first");
    await api("/api/tags/bulk-apply", {
      method: "POST",
      body: JSON.stringify({ tagId, threadIds: ids }),
    });
    toast.success(`Tagged ${ids.length} thread(s)`);
    setSelectedIds(new Set());
    onSync();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl tracking-tight text-slate-900">Inbox</h1>
          <p className="mt-1 text-sm text-slate-500">
            Threads, reply tracking, and suffix filters
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/domains"
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm hover:bg-slate-50"
          >
            Manage client domains
          </Link>
          <Button variant="outline" onClick={syncNow} disabled={syncing}>
            {syncing ? <Spinner size="sm" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>

      {savedFilters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Clients
          </span>
          <span className="text-xs text-slate-400">Select one or more</span>
          {savedFilters.map((f) => {
            const active = filters.domains.includes(f.domain);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleDomain(f.domain)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition",
                  active ? "shadow-sm" : "bg-white hover:bg-slate-50"
                )}
                style={{
                  backgroundColor: active ? `${f.color}22` : undefined,
                  borderColor: active ? `${f.color}88` : undefined,
                  color: active ? f.color : undefined,
                }}
              >
                {active ? "✓ " : ""}
                {f.name}
                <span className="ml-1 opacity-70">@{f.domain}</span>
              </button>
            );
          })}
          {filters.domains.length > 0 && (
            <button
              type="button"
              className="text-xs text-slate-500 underline hover:text-slate-800"
              onClick={() => setFilters((prev) => ({ ...prev, domains: [] }))}
            >
              Clear clients ({filters.domains.length})
            </button>
          )}
          {domains.filter((d) => !savedFilters.some((f) => f.domain === d.domain)).length >
            0 && (
            <>
              <span className="ml-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Other
              </span>
              {domains
                .filter((d) => !savedFilters.some((f) => f.domain === d.domain))
                .slice(0, 12)
                .map((d) => {
                  const active = filters.domains.includes(d.domain);
                  return (
                    <button
                      key={d.domain}
                      type="button"
                      onClick={() => toggleDomain(d.domain)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs transition",
                        active
                          ? "border-teal-300 bg-teal-50 text-teal-800"
                          : "bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {active ? "✓ " : ""}@{d.domain}
                    </button>
                  );
                })}
            </>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Reply needed
        </span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {AWAITING_OPTIONS.map((opt) => {
            const active = filters.awaiting === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                title={opt.hint}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    awaiting: opt.value,
                    // clear fine-grained status so awaiting takes effect
                    status: "",
                    unansweredOnly: opt.value === "us" ? f.unansweredOnly : false,
                  }))
                }
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition",
                  active
                    ? "bg-teal-700 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-slate-400">
          {AWAITING_OPTIONS.find((o) => o.value === filters.awaiting)?.hint}
        </span>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-sm md:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search subject or body…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
        </div>
        <select
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
          value={filters.status}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              status: e.target.value,
              awaiting: e.target.value ? "all" : f.awaiting,
            }))
          }
        >
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABELS) as ThreadStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
          value={filters.tag}
          onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              +{t.name}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
          value={filters.repliedBy}
          onChange={(e) => setFilters((f) => ({ ...f, repliedBy: e.target.value }))}
        >
          <option value="">Any replier</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Sender name / email"
          value={filters.sender}
          onChange={(e) => setFilters((f) => ({ ...f, sender: e.target.value }))}
        />
        <Input
          placeholder="Add domain e.g. acme.com (Enter)"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const value = (e.target as HTMLInputElement).value
              .trim()
              .replace(/^@/, "")
              .toLowerCase();
            if (!value) return;
            toggleDomain(value);
            (e.target as HTMLInputElement).value = "";
          }}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 md:col-span-2">
          <Checkbox
            checked={filters.unansweredOnly}
            onCheckedChange={(v) =>
              setFilters((f) => ({ ...f, unansweredOnly: v === true }))
            }
          />
          Overdue unanswered only
        </label>
        {(filters.domains.length > 0 ||
          filters.sender ||
          filters.status ||
          filters.tag ||
          filters.q ||
          filters.repliedBy ||
          filters.unansweredOnly ||
          filters.awaiting !== "us") && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setFilters({
                q: "",
                status: "",
                awaiting: "us",
                tag: "",
                repliedBy: "",
                sender: "",
                domains: [],
                unansweredOnly: false,
              })
            }
          >
            Clear filters
          </Button>
        )}
        {filters.domains.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 md:col-span-6">
            <span className="text-xs text-slate-500">Active domains:</span>
            {filters.domains.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDomain(d)}
                className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-800"
              >
                @{d} ×
              </button>
            ))}
          </div>
        )}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-4">
            <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
            {tags.map((t) => (
              <Button key={t.id} size="xs" variant="outline" onClick={() => bulkApplyTag(t.id)}>
                Apply +{t.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid h-[calc(100vh-14rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
          {loadingThreads && <OverlayLoader label="Loading threads…" />}
          <ScrollArea className="h-full">
            <div className="divide-y divide-slate-100">
              {threads.map((t) => {
                const sender = senderFromParticipants(t.participants);
                const domain = domainFromEmail(sender);
                const active = selectedId === t.id;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex cursor-pointer gap-2 px-3 py-3 transition hover:bg-teal-50/50",
                      active && "bg-teal-50/80",
                      t.unread && "bg-sky-50/40"
                    )}
                  >
                    <Checkbox
                      checked={selectedIds.has(t.id)}
                      onCheckedChange={() => toggleSelect(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setSelectedId(t.id);
                        router.replace(`/inbox?thread=${t.id}`);
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {sender}
                        </div>
                        <div className="shrink-0 text-[11px] text-slate-500">
                          {relativeTime(t.latestMessageAt)}
                        </div>
                      </div>
                      <div className="truncate text-sm text-slate-800">{t.subject}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        {t.snippet}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {domain && (
                          <span
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "cursor-pointer rounded border px-1.5 py-0.5 text-[11px]",
                              filters.domains.includes(domain)
                                ? "border-teal-300 bg-teal-50 text-teal-800"
                                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-300 hover:text-teal-800"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDomain(domain);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                toggleDomain(domain);
                              }
                            }}
                          >
                            @{domain}
                          </span>
                        )}
                        <StatusBadge status={t.status} />
                        {t.tags.map((tag) => (
                          <TagChip key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                        {t.lastReplier && (
                          <span className="text-[11px] text-slate-500">
                            by {t.lastReplier.name}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
              {!loadingThreads && !threads.length && (
                <div className="p-8 text-center text-sm text-slate-500">
                  No threads match these filters.
                </div>
              )}
              {loadingThreads && !threads.length && <InlineLoader label="Fetching inbox…" />}
            </div>
          </ScrollArea>
        </div>

        <div className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
          {loadingDetail && <OverlayLoader label="Loading conversation…" />}
          {!detail && !loadingDetail ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              Select a thread to read the conversation
            </div>
          ) : detail ? (
            <>
              <div className="border-b border-slate-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 flex-1 text-xl text-slate-900">
                    {detail.thread.subject}
                  </h2>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => copyThreadLink(detail.thread.id)}
                      title="Copy InboxLens link"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Copy link
                    </Button>
                    {gmailOpenUrl(detail.thread.externalId) && (
                      <a
                        href={gmailOpenUrl(detail.thread.externalId)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in Gmail"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open mail
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={detail.thread.status} />
                  {detail.thread.tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      name={tag.name}
                      color={tag.color}
                      onRemove={() => removeTag(tag.id)}
                    />
                  ))}
                  {detail.thread.replyTimeSeconds != null && (
                    <span className="text-xs text-slate-500">
                      First reply in {formatReplyTime(detail.thread.replyTimeSeconds)}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                    value={detail.thread.assignedTo?.id || ""}
                    onChange={(e) => assign(e.target.value || null)}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        Assign: {u.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                    value={detail.thread.status}
                    onChange={(e) => setStatus(e.target.value as ThreadStatus)}
                  >
                    {(Object.keys(STATUS_LABELS) as ThreadStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) addTag(e.target.value);
                      e.target.value = "";
                    }}
                  >
                    <option value="">Add tag…</option>
                    {tags
                      .filter((t) => !detail.thread.tags.some((x) => x.id === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          +{t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "rounded-xl border p-3",
                        m.isIncoming
                          ? "border-slate-200 bg-slate-50"
                          : "border-teal-200 bg-teal-50/60"
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {m.fromName || m.fromEmail}
                          <span className="ml-2 font-normal text-slate-500">
                            {m.fromEmail}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateTime(m.sentAt)}
                        </div>
                      </div>
                      {!m.isIncoming && m.repliedBy && (
                        <div className="mt-1 text-xs text-teal-800">
                          Team reply by {m.repliedBy.name}
                        </div>
                      )}
                      {m.detectedSuffix && (
                        <div className="mt-1">
                          <TagChip name={m.detectedSuffix} color="#0f766e" />
                        </div>
                      )}
                      <EmailBody bodyHtml={m.bodyHtml} bodyText={m.bodyText} />
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t border-slate-100 p-3">
                <Textarea
                  placeholder="Write a reply (logged as your team response)…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                />
                <div className="mt-2 flex justify-end">
                    <Button
                    className="bg-teal-700 hover:bg-teal-800"
                    disabled={sending || !reply.trim()}
                    onClick={sendReply}
                  >
                    {sending ? <Spinner size="sm" className="border-white border-t-transparent" /> : <Send className="h-4 w-4" />}
                    {sending ? "Sending…" : "Send reply"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
