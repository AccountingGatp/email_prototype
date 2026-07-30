"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Settings = Record<string, string>;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ settings: Settings }>("/api/settings").then((r) => setSettings(r.settings));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ settings: Settings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(r.settings);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Unanswered thresholds, inbox address, and provider
        </p>
      </div>

      <form
        onSubmit={onSave}
        className="max-w-xl space-y-5 rounded-xl border border-slate-200/80 bg-white/90 p-5 shadow-sm"
      >
        <div className="space-y-1.5">
          <Label htmlFor="inbox">Shared inbox email</Label>
          <Input
            id="inbox"
            value={settings.shared_inbox_email || ""}
            onChange={(e) =>
              setSettings((s) => ({ ...s, shared_inbox_email: e.target.value }))
            }
          />
          <p className="text-xs text-slate-500">
            Used to detect plus-address suffixes like support+clientX@…
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="threshold">Unanswered alert threshold (hours)</Label>
          <Input
            id="threshold"
            type="number"
            min={1}
            value={settings.unanswered_threshold_hours || "4"}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                unanswered_threshold_hours: e.target.value,
              }))
            }
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <div>
            <div className="text-sm font-medium">Notify on unanswered</div>
            <div className="text-xs text-slate-500">
              Create in-app alerts when threshold is exceeded
            </div>
          </div>
          <Switch
            checked={settings.notify_unanswered !== "false"}
            onCheckedChange={(v) =>
              setSettings((s) => ({
                ...s,
                notify_unanswered: v ? "true" : "false",
              }))
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="provider">Email provider</Label>
          <select
            id="provider"
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
            value={settings.provider || "demo"}
            onChange={(e) => setSettings((s) => ({ ...s, provider: e.target.value }))}
          >
            <option value="demo">Demo (simulated inbox)</option>
            <option value="gmail">Gmail API</option>
            <option value="graph">Microsoft Graph</option>
          </select>
          <p className="text-xs text-slate-500">
            For Gmail/Graph, set credentials in the backend <code>.env</code> file.
          </p>
        </div>

        <Button type="submit" className="bg-teal-700 hover:bg-teal-800" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </AppShell>
  );
}
