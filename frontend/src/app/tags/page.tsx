"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TagChip } from "@/components/status-badge";
import { PageLoader, Spinner } from "@/components/loader";
import { api } from "@/lib/api";
import type { Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const COLORS = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#0891b2", "#0f766e"];

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<{ tags: Tag[] }>("/api/tags")
      .then((r) => setTags(r.tags))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/tags", {
        method: "POST",
        body: JSON.stringify({ name, color, description }),
      });
      setName("");
      setDescription("");
      toast.success("Tag created");
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
      await api(`/api/tags/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editing.name,
          color: editing.color,
          description: editing.description,
        }),
      });
      setEditing(null);
      toast.success("Tag updated");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this tag? It will be removed from all threads.")) return;
    await api(`/api/tags/${id}`, { method: "DELETE" });
    toast.success("Tag deleted");
    load();
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight text-slate-900">Suffix tags</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage plus-address suffixes like <code>support+billing@…</code> and manual labels
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <form
          onSubmit={onCreate}
          className="h-fit space-y-3 rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-sm"
        >
          <h2 className="text-lg text-slate-900">Create tag</h2>
          <div className="space-y-1.5">
            <Label htmlFor="name">Suffix name</Label>
            <Input
              id="name"
              placeholder="billing"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
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
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800" disabled={saving}>
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" className="border-white border-t-transparent" />
                Creating…
              </span>
            ) : (
              "Create tag"
            )}
          </Button>
        </form>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 shadow-sm">
          {loading ? (
            <PageLoader label="Loading tags…" />
          ) : (
          <div className="divide-y divide-slate-100">
            {tags.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <TagChip name={t.name} color={t.color} />
                    <span className="text-xs text-slate-500">{t.threadCount ?? 0} threads</span>
                  </div>
                  {t.description && (
                    <p className="mt-1 text-sm text-slate-600">{t.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => onDelete(t.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
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
            <h3 className="text-lg text-slate-900">Edit tag</h3>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
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
              value={editing.description || ""}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
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
