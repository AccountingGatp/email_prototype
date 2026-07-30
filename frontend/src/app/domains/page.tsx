"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageLoader, Spinner } from "@/components/loader";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type DomainFilter = {
  id: string;
  name: string;
  domain: string;
  color: string;
  notes?: string;
  threadCount?: number;
  createdAt?: string;
};

const COLORS = ["#0f766e", "#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#0891b2"];

export default function DomainsPage() {
  const [filters, setFilters] = useState<DomainFilter[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<DomainFilter | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<{ filters: DomainFilter[] }>("/api/domain-filters")
      .then((r) => setFilters(r.filters || []))
      .catch((e) => {
        console.error(e);
        toast.error(e.message || "Failed to load domain filters");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ filter: DomainFilter; existing?: boolean }>(
        "/api/domain-filters",
        {
          method: "POST",
          body: JSON.stringify({ name, domain, color, notes }),
        }
      );
      setName("");
      setDomain("");
      setNotes("");
      toast.success(
        res.existing ? "Domain already saved — showing it in the list" : "Client domain filter created"
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await api(`/api/domain-filters/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.name,
          domain: editing.domain,
          color: editing.color,
          notes: editing.notes,
        }),
      });
      setEditing(null);
      toast.success("Filter updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this client domain filter?")) return;
    await api(`/api/domain-filters/${id}`, { method: "DELETE" });
    toast.success("Filter deleted");
    load();
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight text-slate-900">Client domain filters</h1>
        <p className="mt-1 text-sm text-slate-500">
          Save client domains (e.g. <code>acmecorp.com</code>) and filter the inbox by them
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <form
          onSubmit={onCreate}
          className="h-fit space-y-3 rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
        >
          <h2 className="text-lg text-slate-900">Add client domain</h2>
          <div className="space-y-1.5">
            <Label htmlFor="name">Client / label</Label>
            <Input
              id="name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="domain">Email domain</Label>
            <Input
              id="domain"
              placeholder="acmecorp.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500">
              Matches senders like name@{domain || "acmecorp.com"}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? "#0f1f24" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
          <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800" disabled={saving}>
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" className="border-white border-t-transparent" />
                Saving…
              </span>
            ) : (
              "Save domain filter"
            )}
          </Button>
        </form>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
          {loading ? (
            <PageLoader label="Loading client domains…" />
          ) : (
          <div className="divide-y divide-slate-100">
            {filters.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${f.color}18`,
                        borderColor: `${f.color}55`,
                        color: f.color,
                      }}
                    >
                      @{f.domain}
                    </span>
                    <span className="font-medium text-slate-900">{f.name}</span>
                    <span className="text-xs text-slate-500">
                      {f.threadCount ?? 0} thread{(f.threadCount || 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  {f.notes && <p className="mt-1 text-sm text-slate-600">{f.notes}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/inbox?domain=${encodeURIComponent(f.domain)}`}
                    className="inline-flex h-7 items-center rounded-lg border border-slate-200 px-2.5 text-[0.8rem] hover:bg-slate-50"
                  >
                    View inbox
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onDelete(f.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!filters.length && (
              <div className="p-8 text-center text-sm text-slate-500">
                No client domains yet. Add one on the left to start filtering.
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={onSaveEdit}
            className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-lg text-slate-900">Edit domain filter</h3>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Client name"
            />
            <Input
              value={editing.domain}
              onChange={(e) => setEditing({ ...editing, domain: e.target.value })}
              placeholder="domain.com"
            />
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditing({ ...editing, color: c })}
                  className="h-7 w-7 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: editing.color === c ? "#0f1f24" : "transparent",
                  }}
                />
              ))}
            </div>
            <Textarea
              value={editing.notes || ""}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-teal-700 hover:bg-teal-800">
                Save
              </Button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
