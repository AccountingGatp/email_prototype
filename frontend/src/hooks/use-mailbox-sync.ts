"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

const SESSION_KEY = "et_mailbox_synced";
export const MAILBOX_SYNCED_EVENT = "et:mailbox-synced";

/**
 * Pull mailbox once when the app is opened (per browser tab session).
 * Manual Sync now still available on the inbox page.
 */
export function useMailboxSyncOnOpen(enabled: boolean) {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    if (typeof window === "undefined") return;

    // Once per tab session — navigating between pages won't re-sync
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      ran.current = true;
      return;
    }

    ran.current = true;
    sessionStorage.setItem(SESSION_KEY, "1");

    api<{ synced: number }>("/api/sync", { method: "POST" })
      .then(() => {
        window.dispatchEvent(new Event(MAILBOX_SYNCED_EVENT));
      })
      .catch((err) => {
        console.warn("[sync on open]", err instanceof Error ? err.message : err);
        // Allow retry on next full page load if this attempt failed
        sessionStorage.removeItem(SESSION_KEY);
      });
  }, [enabled]);
}

/** Clear session flag so the next app open syncs again (e.g. after logout). */
export function resetMailboxSyncSession() {
  if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}
