import { google } from "googleapis";
import { getSetting, setSetting } from "../db/models.js";

export const GMAIL_REAUTH_CODE = "GMAIL_REAUTH_REQUIRED";
export const GMAIL_TOKEN_SETTING = "gmail_refresh_token";
export const GMAIL_MAILBOX_SETTING = "gmail_connected_mailbox";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

export function gmailOAuthClient(redirectUri = "postmessage") {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in backend/.env");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Prefer MongoDB token; migrate from env once, then never re-import. */
export async function getGmailRefreshToken() {
  const migrated = (await getSetting("gmail_token_migrated")) === "true";
  if (migrated) {
    return (await getSetting(GMAIL_TOKEN_SETTING)) || "";
  }

  const fromDb = await getSetting(GMAIL_TOKEN_SETTING);
  if (fromDb) {
    await setSetting("gmail_token_migrated", "true");
    return fromDb;
  }

  const fromEnv = process.env.GMAIL_REFRESH_TOKEN || "";
  if (fromEnv) {
    await setSetting(GMAIL_TOKEN_SETTING, fromEnv);
    await setSetting("gmail_token_migrated", "true");
    return fromEnv;
  }

  await setSetting("gmail_token_migrated", "true");
  return "";
}

export async function saveGmailRefreshToken(refreshToken, mailboxEmail = "") {
  if (!refreshToken) throw new Error("Missing refresh token");
  await setSetting(GMAIL_TOKEN_SETTING, refreshToken);
  await setSetting("gmail_token_migrated", "true");
  if (mailboxEmail) await setSetting(GMAIL_MAILBOX_SETTING, mailboxEmail.toLowerCase());
  await setSetting("gmail_token_updated_at", new Date().toISOString());
}

export async function clearGmailRefreshToken() {
  await setSetting(GMAIL_TOKEN_SETTING, "");
  await setSetting("gmail_token_migrated", "true");
}

export async function getGmailConnectionStatus() {
  const token = await getGmailRefreshToken();
  const mailbox =
    (await getSetting(GMAIL_MAILBOX_SETTING)) ||
    (await getSetting("shared_inbox_email")) ||
    process.env.SHARED_MAILBOX_EMAIL ||
    "";
  const updatedAt = await getSetting("gmail_token_updated_at");
  return {
    connected: Boolean(token),
    mailbox,
    updatedAt: updatedAt || null,
    scopes: GMAIL_SCOPES,
    clientId: process.env.GMAIL_CLIENT_ID || null,
  };
}

/**
 * Exchange an auth code from the frontend Google popup (redirect_uri=postmessage).
 */
export async function exchangeGmailAuthCode(code) {
  const oauth2 = gmailOAuthClient("postmessage");
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    // May still have access_token if user already consented — keep prior refresh token if present
    const existing = await getGmailRefreshToken();
    if (!existing) {
      throw new Error(
        "Google did not return a refresh token. Remove app access in Google Account → Security → Third-party access, then reconnect with consent."
      );
    }
    oauth2.setCredentials(tokens);
  } else {
    await saveGmailRefreshToken(tokens.refresh_token);
    oauth2.setCredentials(tokens);
  }

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = (profile.data.emailAddress || "").toLowerCase();
  if (tokens.refresh_token) {
    await saveGmailRefreshToken(tokens.refresh_token, email);
  } else if (email) {
    await setSetting(GMAIL_MAILBOX_SETTING, email);
  }

  return {
    mailbox: email,
    hasRefreshToken: Boolean(tokens.refresh_token || (await getGmailRefreshToken())),
  };
}

export function isGmailAuthError(err) {
  const msg = err?.message || String(err);
  const code = err?.response?.data?.error || err?.code;
  return code === "invalid_grant" || /invalid_grant/i.test(msg);
}

export function makeGmailReauthError(err) {
  const error = new Error(
    "Gmail access expired. Reconnect Google from Sync to continue."
  );
  error.code = GMAIL_REAUTH_CODE;
  error.cause = err;
  return error;
}
