import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../db/models.js";
import { authRequired, signToken } from "../middleware/auth.js";

const router = Router();

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
    const safe = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    res.json({ token: signToken(safe), user: safe });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
