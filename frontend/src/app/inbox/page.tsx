"use client";

import { Suspense } from "react";
import InboxPage from "./inbox-client";
import { AppShell } from "@/components/app-shell";
import { PageLoader } from "@/components/loader";

export default function Page() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <PageLoader label="Loading inbox…" />
        </AppShell>
      }
    >
      <InboxPage />
    </Suspense>
  );
}
