import jwt from "jsonwebtoken";
import { User } from "../db/models.js";

const JWT_SECRET = process.env.JWT_SECRET || "email-tracker-dev-secret-change-me";

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await User.findById(payload.id).select("_id name email role").lean();
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    req.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export { JWT_SECRET };
