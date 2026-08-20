"use client";

import { api, ApiError } from "@/lib/api";
import { getGoogleClientId } from "@/components/google-auth-provider";

export const GMAIL_REAUTH_CODE = "GMAIL_REAUTH_REQUIRED";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

type CodeClient = { requestCode: () => void };

type GoogleAccounts = {
  accounts: {
    oauth2: {
      initCodeClient: (config: Record<string, unknown>) => CodeClient;
    };
  };
};

function isReauthError(err: unknown): boolean {
  return err instanceof ApiError && err.code === GMAIL_REAUTH_CODE;
}

/**
 * Open Google consent (auth-code), exchange on backend, store refresh token in MongoDB.
 * Must be called from a user gesture (button click) for popup reliability.
 */
export function requestGmailAuthCode(): Promise<string> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set"));
  }

  return new Promise((resolve, reject) => {
    const google = (window as unknown as { google?: GoogleAccounts }).google;
    if (!google?.accounts?.oauth2?.initCodeClient) {
      reject(new Error("Google Identity Services not loaded yet. Refresh and try again."));
      return;
    }

    const client = google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: GMAIL_SCOPES,
      ux_mode: "popup",
      prompt: "consent",
      callback: (response: { code?: string; error?: string; error_description?: string }) => {
        if (response.error || !response.code) {
          reject(
            new Error(
              response.error_description ||
                response.error ||
                "Google authorization was cancelled"
            )
          );
          return;
        }
        resolve(response.code);
      },
      error_callback: (err: { message?: string }) => {
        reject(new Error(err?.message || "Google popup failed"));
      },
    });
    client.requestCode();
  });
}

export async function connectGmailWithCode(code: string) {
  return api<{ ok: boolean; mailbox: string; message: string }>("/api/gmail/connect", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Run mailbox sync. If Gmail token expired, open Google consent, save new token to MongoDB, retry once.
 */
export async function syncMailboxWithReauth(options?: {
  /** Prefer true for Sync now button (user gesture). On open, skip popup. */
  allowPopup?: boolean;
}): Promise<{ synced: number; reconnected?: boolean }> {
  const allowPopup = options?.allowPopup !== false;

  try {
    return await api<{ synced: number }>("/api/sync", { method: "POST" });
  } catch (err) {
    if (!isReauthError(err) || !allowPopup) throw err;

    const code = await requestGmailAuthCode();
    await connectGmailWithCode(code);
    const result = await api<{ synced: number }>("/api/sync", { method: "POST" });
    return { ...result, reconnected: true };
  }
}
