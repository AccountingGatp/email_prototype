/**
 * One-time helper: open a browser, consent as the shared mailbox user,
 * then print a refresh token for backend/.env (GMAIL_REFRESH_TOKEN).
 *
 * Usage (from backend/):
 *   node scripts/get-gmail-refresh-token.js
 *
 * Requires GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET in .env
 * Redirect URI must be authorized in Google Cloud Console:
 *   http://localhost:53682/oauth2callback
 */

import "dotenv/config";
import http from "http";
import { google } from "googleapis";
import { URL } from "url";

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
];

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in backend/.env first.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const code = u.searchParams.get("code");
    if (!code) {
      res.writeHead(400);
      res.end("Missing code");
      return;
    }
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h1>Success</h1><p>You can close this tab and return to the terminal.</p>"
    );
    console.log("\n--- Paste into backend/.env ---\n");
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token || "(none — revoke app access and retry with prompt=consent)"}`);
    console.log("\n--------------------------------\n");
    if (!tokens.refresh_token) {
      console.warn(
        "No refresh_token returned. In Google Account → Security → Third-party access, remove this app, then run again."
      );
    }
    server.close();
    process.exit(tokens.refresh_token ? 0 : 1);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end(String(err.message || err));
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("Open this URL in a browser and sign in as the shared mailbox owner:\n");
  console.log(authUrl);
  console.log(`\nWaiting for callback on ${REDIRECT} ...`);
});
