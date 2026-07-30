import { Router } from "express";
import { nanoid } from "nanoid";
import { DomainFilter, Message } from "../db/models.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

function normalizeDomain(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split("?")[0];
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Fast-ish count: incoming messages whose fromEmail ends with @domain */
async function threadCountForDomain(domain) {
  try {
    const domainRe = new RegExp(`@${escapeRegex(domain)}$`, "i");
    const ids = await Message.distinct("threadId", {
      isIncoming: true,
      fromEmail: domainRe,
    });
    return ids.length;
  } catch {
    return 0;
  }
}

function mapFilter(f, threadCount = 0) {
  return {
    id: f._id,
    name: f.name,
    domain: f.domain,
    color: f.color,
    notes: f.notes || "",
    createdBy: f.createdBy,
    createdAt: f.createdAt,
    threadCount,
  };
}

router.get("/", async (_req, res) => {
  try {
    const filters = await DomainFilter.find().sort({ name: 1 }).lean();

    // Prefer a fast list; counts are best-effort (large mailboxes can make counts slow)
    const withCounts = await Promise.all(
      filters.map(async (f) => {
        try {
          const threadCount = await Promise.race([
            threadCountForDomain(f.domain),
            new Promise((resolve) => setTimeout(() => resolve(0), 2500)),
          ]);
          return mapFilter(f, Number(threadCount) || 0);
        } catch {
          return mapFilter(f, 0);
        }
      })
    );

    res.json({ filters: withCounts });
  } catch (err) {
    console.error("[domain-filters] list error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, domain, color, notes } = req.body || {};
    const normalized = normalizeDomain(domain);
    if (!normalized) return res.status(400).json({ error: "Domain required" });
    if (!normalized.includes(".")) {
      return res.status(400).json({ error: "Enter a valid domain like acme.com" });
    }

    const existing = await DomainFilter.findOne({ domain: normalized }).lean();
    if (existing) {
      // Idempotent: return the existing filter instead of a confusing 409
      return res.status(200).json({
        filter: mapFilter(existing, await threadCountForDomain(existing.domain)),
        existing: true,
      });
    }

    const filter = await DomainFilter.create({
      _id: nanoid(),
      name: (name || normalized).trim(),
      domain: normalized,
      color: color || "#0f766e",
      notes: notes || "",
      createdBy: req.user.id,
    });

    res.status(201).json({
      filter: mapFilter(filter.toObject(), await threadCountForDomain(filter.domain)),
    });
  } catch (err) {
    // Race: unique index hit
    if (err?.code === 11000) {
      const normalized = normalizeDomain(req.body?.domain);
      const existing = await DomainFilter.findOne({ domain: normalized }).lean();
      if (existing) {
        return res.status(200).json({
          filter: mapFilter(existing, await threadCountForDomain(existing.domain)),
          existing: true,
        });
      }
    }
    console.error("[domain-filters] create error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const filter = await DomainFilter.findById(req.params.id);
    if (!filter) return res.status(404).json({ error: "Filter not found" });

    if (req.body.name?.trim()) filter.name = req.body.name.trim();
    if (req.body.color) filter.color = req.body.color;
    if (req.body.notes !== undefined) filter.notes = req.body.notes;
    if (req.body.domain) {
      const normalized = normalizeDomain(req.body.domain);
      if (!normalized.includes(".")) {
        return res.status(400).json({ error: "Enter a valid domain like acme.com" });
      }
      const clash = await DomainFilter.findOne({
        domain: normalized,
        _id: { $ne: filter._id },
      });
      if (clash) {
        return res.status(409).json({ error: "Domain filter already exists" });
      }
      filter.domain = normalized;
    }
    await filter.save();

    res.json({
      filter: mapFilter(filter.toObject(), await threadCountForDomain(filter.domain)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const filter = await DomainFilter.findByIdAndDelete(req.params.id);
    if (!filter) return res.status(404).json({ error: "Filter not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
