"use client";

import { useEffect, useRef } from "react";
import { api, ApiError } from "@/lib/api";
import { GMAIL_REAUTH_CODE } from "@/lib/gmail-connect";

const SESSION_KEY = "et_mailbox_synced";
export const MAILBOX_SYNCED_EVENT = "et:mailbox-synced";
export const MAILBOX_REAUTH_EVENT = "et:mailbox-reauth";

/**
 * Pull mailbox once when the app is opened (per browser tab session).
 * If Gmail token expired, emit MAILBOX_REAUTH_EVENT (popup needs a click — Sync now).
 * Manual Sync now still available on the inbox page.
 */
export function useMailboxSyncOnOpen(enabled: boolean) {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || ran.current) return;
    if (typeof window === "undefined") return;

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
        sessionStorage.removeItem(SESSION_KEY);
        if (err instanceof ApiError && err.code === GMAIL_REAUTH_CODE) {
          window.dispatchEvent(new Event(MAILBOX_REAUTH_EVENT));
        }
      });
  }, [enabled]);
}

/** Clear session flag so the next app open syncs again (e.g. after logout). */
export function resetMailboxSyncSession() {
  if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}
