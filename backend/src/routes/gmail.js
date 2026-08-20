import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import {
  exchangeGmailAuthCode,
  getGmailConnectionStatus,
  GMAIL_REAUTH_CODE,
} from "../services/gmail-auth.js";

const router = Router();

router.use(authRequired);

router.get("/status", async (_req, res) => {
  try {
    res.json(await getGmailConnectionStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Body: { code } — authorization code from Google Identity Services (popup).
 * Stores refresh token in MongoDB and returns connected mailbox.
 */
router.post("/connect", async (req, res) => {
  try {
    const code = req.body?.code;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Missing authorization code" });
    }
    const result = await exchangeGmailAuthCode(code);
    res.json({
      ok: true,
      mailbox: result.mailbox,
      hasRefreshToken: result.hasRefreshToken,
      message: result.hasRefreshToken
        ? "Gmail connected. Token saved to MongoDB."
        : "Connected with existing refresh token.",
    });
  } catch (err) {
    const msg = err?.message || String(err);
    const needsReauth =
      /invalid_grant/i.test(msg) || /refresh token/i.test(msg);
    res.status(needsReauth ? 401 : 500).json({
      error: msg,
      code: needsReauth ? GMAIL_REAUTH_CODE : undefined,
    });
  }
});

export default router;
