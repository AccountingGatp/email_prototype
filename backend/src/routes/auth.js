import { Router } from "express";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { OAuth2Client } from "google-auth-library";
import { User } from "../db/models.js";
import { authRequired, signToken } from "../middleware/auth.js";

const router = Router();

const ALLOWED_DOMAIN = "gmail.com";

function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.GMAIL_CLIENT_ID || "";
}

function isAllowedEmail(email) {
  const e = String(email || "").toLowerCase().trim();
  return e.endsWith(`@${ALLOWED_DOMAIN}`);
}

function toSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const safe = toSafeUser(user);
    res.json({ token: signToken(safe), user: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Google Identity Services popup — body: { credential: <Google ID token JWT> } */
router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential) {
      return res.status(400).json({ error: "Google credential required" });
    }

    const clientId = googleClientId();
    if (!clientId) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not configured" });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(401).json({ error: "Invalid Google token" });
    }
    if (payload.email_verified === false) {
      return res.status(403).json({ error: "Google email is not verified" });
    }

    const email = String(payload.email).toLowerCase();
    if (!isAllowedEmail(email)) {
      return res.status(403).json({
        error: `Only @${ALLOWED_DOMAIN} accounts are allowed`,
      });
    }

    const name =
      payload.name ||
      [payload.given_name, payload.family_name].filter(Boolean).join(" ") ||
      email.split("@")[0];

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        _id: nanoid(),
        name,
        email,
        passwordHash: bcrypt.hashSync(nanoid(32), 10),
        role: "member",
      });
    } else if (name && user.name !== name) {
      user.name = name;
      await user.save();
    }

    const safe = toSafeUser(user);
    res.json({ token: signToken(safe), user: safe });
  } catch (err) {
    console.error("[auth/google]", err.message);
    res.status(401).json({ error: "Google sign-in failed" });
  }
});

router.get("/me", authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.get("/users", authRequired, async (_req, res) => {
  try {
    const users = await User.find()
      .select("_id name email role createdAt")
      .sort({ name: 1 })
      .lean();
    res.json({
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
