import { Router } from "express";
import { nanoid } from "nanoid";
import { Thread, Message, Tag, User, getSetting } from "../db/models.js";
import { authRequired } from "../middleware/auth.js";
import { mapMessage } from "../services/helpers.js";
import { enrichThreads, recomputeThreadStatus } from "../services/threads.js";

const router = Router();
router.use(authRequired);

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDomain(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
}

/** Collect unique client domains from incoming messages + participants. */
router.get("/meta/domains", async (_req, res) => {
  try {
    const shared =
      ((await getSetting("shared_inbox_email")) || "").toLowerCase().split("@")[1] ||
      "company.com";
    const teamDomains = new Set(
      (
        await User.find().select("email").lean()
      )
        .map((u) => (u.email || "").split("@")[1]?.toLowerCase())
        .filter(Boolean)
    );
    teamDomains.add(shared);
    teamDomains.add("company.com");
    teamDomains.add("gatpsolutions.com");

    const fromEmails = await Message.find({ isIncoming: true })
      .distinct("fromEmail");
    const participants = await Thread.distinct("participants");

    const counts = new Map();
    for (const email of [...fromEmails, ...participants.flat()]) {
      const domain = String(email || "")
        .toLowerCase()
        .split("@")[1];
      if (!domain || teamDomains.has(domain)) continue;
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }

    const domains = [...counts.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));

    res.json({ domains });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      status,
      tag,
      repliedBy,
      q,
      sender,
      domain,
      from,
      to,
      assignedTo,
      unansweredOnly,
      sort = "latest",
      page = "1",
      limit = "50",
    } = req.query;

    const filter = {};
    const andClauses = [];

    if (status) filter.status = status;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (tag) {
      const tagDoc = await Tag.findOne({
        $or: [{ _id: tag }, { name: new RegExp(`^${escapeRegex(tag)}$`, "i") }],
      }).lean();
      if (tagDoc) filter.tagIds = tagDoc._id;
      else filter.tagIds = "__none__";
    }
    if (from || to) {
      filter.latestMessageAt = {};
      if (from) filter.latestMessageAt.$gte = new Date(from);
      if (to) filter.latestMessageAt.$lte = new Date(to);
    }
    if (unansweredOnly === "true") {
      const hours = Number((await getSetting("unanswered_threshold_hours")) || 4);
      const cutoff = new Date(Date.now() - hours * 3600 * 1000);
      filter.status = "not_replied";
      filter.firstIncomingAt = { $lte: cutoff };
    }

    const idSets = [];

    if (sender) {
      const senderRe = new RegExp(escapeRegex(sender), "i");
      const msgThreadIds = await Message.find({
        isIncoming: true,
        $or: [{ fromEmail: senderRe }, { fromName: senderRe }],
      }).distinct("threadId");
      andClauses.push({
        $or: [
          { participants: { $elemMatch: { $regex: senderRe } } },
          { _id: { $in: msgThreadIds } },
        ],
      });
    }

    if (domain) {
      const d = normalizeDomain(domain);
      if (d) {
        const domainRe = new RegExp(`@${escapeRegex(d)}$`, "i");
        const msgThreadIds = await Message.find({
          isIncoming: true,
          fromEmail: domainRe,
        }).distinct("threadId");
        andClauses.push({
          $or: [
            { participants: { $elemMatch: { $regex: domainRe } } },
            { _id: { $in: msgThreadIds } },
          ],
        });
      }
    }

    if (q) {
      const qRe = new RegExp(escapeRegex(q), "i");
      const msgHits = await Message.find({ bodyText: qRe }).distinct("threadId");
      andClauses.push({
        $or: [
          { subject: qRe },
          { snippet: qRe },
          { _id: { $in: msgHits } },
        ],
      });
    }

    if (repliedBy) {
      const threadIds = await Message.find({
        isIncoming: false,
        repliedBy,
      }).distinct("threadId");
      idSets.push(threadIds);
    }

    if (idSets.length) {
      let intersection = idSets[0];
      for (let i = 1; i < idSets.length; i++) {
        const set = new Set(idSets[i]);
        intersection = intersection.filter((id) => set.has(id));
      }
      filter._id = { $in: intersection };
    }

    if (andClauses.length) filter.$and = andClauses;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    let sortSpec = { latestMessageAt: -1 };
    if (sort === "oldest") sortSpec = { latestMessageAt: 1 };
    if (sort === "oldest_unanswered") {
      sortSpec = { status: 1, firstIncomingAt: 1 };
    }

    const [total, rows] = await Promise.all([
      Thread.countDocuments(filter),
      Thread.find(filter).sort(sortSpec).skip(skip).limit(limitNum).lean(),
    ]);

    const threads = await enrichThreads(rows);
    if (sort === "oldest_unanswered") {
      threads.sort((a, b) => {
        const aU = a.status === "not_replied" ? 0 : 1;
        const bU = b.status === "not_replied" ? 0 : 1;
        if (aU !== bU) return aU - bU;
        return new Date(a.firstIncomingAt || 0) - new Date(b.firstIncomingAt || 0);
      });
    }

    res.json({
      threads,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const row = await Thread.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ error: "Thread not found" });

    const [enriched, messages] = await Promise.all([
      enrichThreads([row]),
      Message.find({ threadId: row._id }).sort({ sentAt: 1 }).lean(),
    ]);

    const replierIds = [
      ...new Set(messages.filter((m) => m.repliedBy).map((m) => m.repliedBy)),
    ];
    const repliers = await User.find({ _id: { $in: replierIds } })
      .select("_id name email")
      .lean();
    const replierMap = Object.fromEntries(repliers.map((u) => [u._id, u]));

    await Thread.updateOne({ _id: row._id }, { unread: false });

    res.json({
      thread: enriched[0],
      messages: messages.map((m) =>
        mapMessage(m, m.repliedBy ? replierMap[m.repliedBy] : null)
      ),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    const { assignedTo, status, tagIds } = req.body || {};

    if (assignedTo !== undefined) {
      if (assignedTo === null) thread.assignedTo = null;
      else {
        const user = await User.findById(assignedTo);
        if (!user) return res.status(400).json({ error: "Invalid assignee" });
        thread.assignedTo = assignedTo;
      }
    }

    if (status) {
      const allowed = ["replied", "not_replied", "replied_by_other", "needs_followup"];
      if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
      thread.status = status;
    }

    if (Array.isArray(tagIds)) thread.tagIds = tagIds;

    await thread.save();
    if (assignedTo !== undefined && !status) {
      await recomputeThreadStatus(thread._id);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/tags", async (req, res) => {
  try {
    const { tagId } = req.body || {};
    const thread = await Thread.findById(req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });
    const tag = await Tag.findById(tagId);
    if (!tag) return res.status(404).json({ error: "Tag not found" });
    await Thread.updateOne({ _id: thread._id }, { $addToSet: { tagIds: tagId } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/tags/:tagId", async (req, res) => {
  try {
    await Thread.updateOne(
      { _id: req.params.id },
      { $pull: { tagIds: req.params.tagId } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/reply", async (req, res) => {
  try {
    const { body } = req.body || {};
    if (!body?.trim()) return res.status(400).json({ error: "Reply body required" });

    const thread = await Thread.findById(req.params.id);
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    const clientEmail =
      (thread.participants || []).find((e) => !String(e).includes("gatpsolutions.com") && !String(e).includes("company.com")) ||
      thread.participants?.[0] ||
      "";

    const sentAt = new Date();
    const msg = await Message.create({
      _id: nanoid(),
      threadId: thread._id,
      externalId: `msg_${nanoid(8)}`,
      fromEmail: req.user.email,
      fromName: req.user.name,
      toEmails: [clientEmail],
      bodyText: body.trim(),
      bodyHtml: `<p>${body.trim().replace(/\n/g, "<br/>")}</p>`,
      sentAt,
      isIncoming: false,
      repliedBy: req.user.id,
    });

    if (!thread.assignedTo) {
      thread.assignedTo = req.user.id;
      await thread.save();
    }

    await recomputeThreadStatus(thread._id);

    const io = req.app.get("io");
    if (io) io.emit("thread:updated", { threadId: thread._id });

    res.status(201).json({
      message: mapMessage(msg.toObject(), {
        _id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
