import { Router } from "express";
import { Thread, Message, Tag, User, DomainFilter, getSetting } from "../db/models.js";
import { authRequired } from "../middleware/auth.js";
import { enrichThreads } from "../services/threads.js";

const router = Router();
router.use(authRequired);

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clientStats(totalThreads) {
  const clients = await DomainFilter.find().sort({ name: 1 }).lean();
  if (!clients.length) return [];

  const denom = Math.max(totalThreads, 1);

  const rows = await Promise.all(
    clients.map(async (c) => {
      const domainRe = new RegExp(`@${escapeRegex(c.domain)}$`, "i");
      const threadIds = await Message.distinct("threadId", {
        isIncoming: true,
        fromEmail: domainRe,
      });

      // Also match participants if no incoming fromEmail hit yet
      const participantIds = await Thread.distinct("_id", {
        participants: { $elemMatch: { $regex: domainRe } },
      });
      const idSet = [...new Set([...threadIds, ...participantIds.map(String)])];
      const count = idSet.length;

      let replied = 0;
      let notReplied = 0;
      if (count) {
        const statusGroups = await Thread.aggregate([
          { $match: { _id: { $in: idSet } } },
          { $group: { _id: "$status", c: { $sum: 1 } } },
        ]);
        const byStatus = Object.fromEntries(statusGroups.map((r) => [r._id, r.c]));
        notReplied = byStatus.not_replied || 0;
        replied =
          (byStatus.replied || 0) +
          (byStatus.replied_by_other || 0) +
          (byStatus.needs_followup || 0);
      }

      return {
        id: c._id,
        name: c.name,
        domain: c.domain,
        color: c.color,
        count,
        percent: Math.round((count / denom) * 1000) / 10,
        replied,
        notReplied,
        repliedPercent: count ? Math.round((replied / count) * 100) : 0,
      };
    })
  );

  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

router.get("/overview", async (_req, res) => {
  try {
    const todayStart = startOfDay();
    const weekStart = startOfWeek();
    const thresholdHours = Number((await getSetting("unanswered_threshold_hours")) || 4);
    const cutoff = new Date(Date.now() - thresholdHours * 3600 * 1000);

    const [totalToday, totalWeek, statusCounts, avgArr, tags, oldest, overdueCount] =
      await Promise.all([
        Thread.countDocuments({ firstIncomingAt: { $gte: todayStart } }),
        Thread.countDocuments({ firstIncomingAt: { $gte: weekStart } }),
        Thread.aggregate([{ $group: { _id: "$status", c: { $sum: 1 } } }]),
        Thread.aggregate([
          { $match: { replyTimeSeconds: { $ne: null } } },
          { $group: { _id: null, avg: { $avg: "$replyTimeSeconds" } } },
        ]),
        Tag.find().lean(),
        Thread.findOne({ status: "not_replied" }).sort({ firstIncomingAt: 1 }).lean(),
        Thread.countDocuments({
          status: "not_replied",
          firstIncomingAt: { $lte: cutoff },
        }),
      ]);

    const byStatus = Object.fromEntries(statusCounts.map((r) => [r._id, r.c]));
    const total = statusCounts.reduce((s, r) => s + r.c, 0);
    const totalSafe = total || 1;
    const replied =
      (byStatus.replied || 0) +
      (byStatus.replied_by_other || 0) +
      (byStatus.needs_followup || 0);
    const notReplied = byStatus.not_replied || 0;

    const tagCounts = await Thread.aggregate([
      { $unwind: { path: "$tagIds", preserveNullAndEmptyArrays: false } },
      { $group: { _id: "$tagIds", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(tagCounts.map((c) => [c._id, c.count]));
    const byTag = tags
      .map((t) => ({
        id: t._id,
        name: t.name,
        color: t.color,
        count: countMap[t._id] || 0,
        percent: Math.round(((countMap[t._id] || 0) / totalSafe) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);

    const byClient = await clientStats(total);

    let oldestUnanswered = null;
    if (oldest) {
      const enriched = await enrichThreads([oldest]);
      oldestUnanswered = enriched[0];
    }

    res.json({
      totalToday,
      totalWeek,
      total,
      replied,
      notReplied,
      repliedPercent: Math.round((replied / totalSafe) * 100),
      notRepliedPercent: Math.round((notReplied / totalSafe) * 100),
      avgReplyTimeSeconds: avgArr[0]?.avg ? Math.round(avgArr[0].avg) : null,
      byTag,
      byClient,
      byStatus,
      oldestUnanswered,
      overdueCount,
      thresholdHours,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/team", async (req, res) => {
  try {
    const range = req.query.range === "today" ? startOfDay() : startOfWeek();
    const users = await User.find().select("_id name email role").sort({ name: 1 }).lean();

    const leaderboard = [];
    for (const u of users) {
      const [replies, assignedOpen, avgArr] = await Promise.all([
        Message.countDocuments({
          repliedBy: u._id,
          isIncoming: false,
          sentAt: { $gte: range },
        }),
        Thread.countDocuments({
          assignedTo: u._id,
          status: { $in: ["not_replied", "needs_followup"] },
        }),
        Thread.aggregate([
          {
            $match: {
              assignedTo: u._id,
              replyTimeSeconds: { $ne: null },
            },
          },
          { $group: { _id: null, avg: { $avg: "$replyTimeSeconds" } } },
        ]),
      ]);
      leaderboard.push({
        user: { id: u._id, name: u.name, email: u.email, role: u.role },
        replies,
        assignedOpen,
        avgReplyTimeSeconds: avgArr[0]?.avg ? Math.round(avgArr[0].avg) : null,
      });
    }
    leaderboard.sort((a, b) => b.replies - a.replies);

    let threads = [];
    if (req.query.userId) {
      const threadIds = await Message.find({
        repliedBy: req.query.userId,
        isIncoming: false,
      }).distinct("threadId");
      const rows = await Thread.find({ _id: { $in: threadIds } })
        .sort({ latestMessageAt: -1 })
        .limit(50)
        .lean();
      threads = await enrichThreads(rows);
    }

    res.json({
      leaderboard,
      range: req.query.range === "today" ? "today" : "week",
      threads,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
