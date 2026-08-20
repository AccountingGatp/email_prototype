import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { connectDb } from "./db/index.js";
import { seed } from "./db/seed.js";
import { getSetting, setSetting } from "./db/models.js";
import authRoutes from "./routes/auth.js";
import tagRoutes from "./routes/tags.js";
import threadRoutes from "./routes/threads.js";
import dashboardRoutes from "./routes/dashboard.js";
import settingsRoutes from "./routes/settings.js";
import domainFilterRoutes from "./routes/domain-filters.js";
import gmailRoutes from "./routes/gmail.js";
import { getGmailRefreshToken } from "./services/gmail-auth.js";

const isVercel = !!process.env.VERCEL;

let ready;
let appInstance;

async function buildApp() {
  await connectDb();
  await seed();

  if (process.env.PROVIDER) await setSetting("provider", process.env.PROVIDER);
  if (process.env.SHARED_MAILBOX_EMAIL) {
    await setSetting("shared_inbox_email", process.env.SHARED_MAILBOX_EMAIL);
  }
  // Migrate env refresh token into MongoDB once (if DB empty)
  await getGmailRefreshToken();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, db: "mongodb" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/tags", tagRoutes);
  app.use("/api/domain-filters", domainFilterRoutes);
  app.use("/api/threads", threadRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/gmail", gmailRoutes);
  app.use("/api", settingsRoutes);

  // Local long-running host only: HTTP + optional Socket.IO (no background Gmail sync)
  if (!isVercel) {
    const server = http.createServer(app);
    const io = new Server(server, {
      cors: { origin: true, credentials: true },
    });
    app.set("io", io);

    io.on("connection", (socket) => {
      socket.emit("connected", { ok: true });
    });

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`Email tracker API on http://localhost:${PORT}`);
    });
  }

  return app;
}

function ensureApp() {
  if (!ready) {
    ready = buildApp().then((app) => {
      appInstance = app;
      return app;
    });
  }
  return ready;
}

if (!isVercel) {
  ensureApp().catch((err) => {
    console.error("Failed to start:", err);
    process.exit(1);
  });
}

// Vercel serverless handler
export default async function handler(req, res) {
  const app = await ensureApp();
  return app(req, res);
}
