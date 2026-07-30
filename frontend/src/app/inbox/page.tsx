"use client";

import { Suspense } from "react";
import InboxPage from "./inbox-client";
import { AppShell } from "@/components/app-shell";

export default function Page() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="text-sm text-slate-500">Loading inbox…</div>
        </AppShell>
      }
    >
      <InboxPage />
    </Suspense>
  );
}
