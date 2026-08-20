import { Router } from "express";
import {
  Notification,
  getSetting,
  setSetting,
  getAllSettings,
} from "../db/models.js";
import { authRequired } from "../middleware/auth.js";
import { upsertIncomingMessage, checkUnansweredAlerts } from "../services/threads.js";
import { createProvider } from "../providers/index.js";

const router = Router();

router.post("/webhooks/email", async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.fromEmail || !payload?.subject) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    const threadId = await upsertIncomingMessage({
      ...payload,
      sentAt: payload.sentAt || new Date().toISOString(),
    });
    const io = req.app.get("io");
    if (io) io.emit("inbox:sync", { threadIds: [threadId] });
    res.json({ ok: true, threadId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(authRequired);

router.get("/settings", async (_req, res) => {
  try {
    const settings = await getAllSettings();
    // Never expose secrets to the browser
    delete settings.gmail_refresh_token;
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    const updates = req.body || {};
    const allowed = [
      "overdue_business_days",
      "unanswered_threshold_hours",
      "shared_inbox_email",
      "notify_unanswered",
      "provider",
    ];
    for (const key of allowed) {
      if (updates[key] !== undefined) await setSetting(key, updates[key]);
    }
    const settings = await getAllSettings();
    delete settings.gmail_refresh_token;
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/notifications", async (req, res) => {
  try {
    const filter = req.query.unread === "true" ? { read: false } : {};
    const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    res.json({
      notifications: rows.map((n) => ({
        id: n._id,
        type: n.type,
        title: n.title,
        body: n.body,
        threadId: n.threadId,
        read: !!n.read,
        createdAt: n.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/notifications/read-all", async (_req, res) => {
  try {
    await Notification.updateMany({}, { read: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/sync", async (req, res) => {
  try {
    const providerName = (await getSetting("provider")) || "demo";
    const provider = await createProvider(providerName);
    const messages = await provider.fetchNewMessages();
    const threadIds = [];
    for (const msg of messages) {
      const id = await upsertIncomingMessage(msg);
      if (id) threadIds.push(id);
    }
    const io = req.app.get("io");
    const alerts = await checkUnansweredAlerts(io);
    if (threadIds.length && io) io.emit("inbox:sync", { threadIds });
    res.json({ synced: messages.length, threadIds, alerts: alerts.length });
  } catch (err) {
    const code = err.code || undefined;
    const status = code === "GMAIL_REAUTH_REQUIRED" ? 401 : 500;
    res.status(status).json({ error: err.message, code });
  }
});

export default router;
