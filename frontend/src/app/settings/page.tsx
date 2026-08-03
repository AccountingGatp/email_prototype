"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { PageLoader, Spinner } from "@/components/loader";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Settings = Record<string, string>;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ settings: Settings }>("/api/settings")
      .then((r) => setSettings(r.settings))
      .finally(() => setLoading(false));
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
          SLA, inbox address, provider, and Gmail label write-back notes
        </p>
      </div>

      {loading ? (
        <PageLoader label="Loading settings…" />
      ) : (
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
            Used for plus-address tags and Gmail Open mail links
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="overdue">Overdue SLA (business days)</Label>
          <Input
            id="overdue"
            type="number"
            min={1}
            value={settings.overdue_business_days || "2"}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                overdue_business_days: e.target.value,
              }))
            }
          />
          <p className="text-xs text-slate-500">
            SOP default is 2 business days for To Respond escalation (Sat/Sun skipped)
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
          <div>
            <div className="text-sm font-medium">Notify on overdue</div>
            <div className="text-xs text-slate-500">
              In-app alerts when To Respond exceeds the SLA
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
            For Gmail, set credentials in the backend <code>.env</code>. Status write-back
            needs OAuth scope <code>https://www.googleapis.com/auth/gmail.modify</code>{" "}
            (in addition to readonly). Labels used: <strong>To Respond</strong>,{" "}
            <strong>Waiting On Them</strong>, <strong>Done</strong>.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Mailbox sync runs when someone opens the app (once per tab session), or via{" "}
          <strong>Sync now</strong> in the inbox. There is no background polling.
        </div>

        <Button type="submit" className="bg-teal-700 hover:bg-teal-800" disabled={saving}>
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Spinner size="sm" className="border-white border-t-transparent" />
              Saving…
            </span>
          ) : (
            "Save settings"
          )}
        </Button>
      </form>
      )}
    </AppShell>
  );
}
