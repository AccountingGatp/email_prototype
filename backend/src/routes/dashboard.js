import { Router } from "express";
import { Thread, Message, Tag, User, DomainFilter, getSetting } from "../db/models.js";
import { authRequired } from "../middleware/auth.js";
import { enrichThreads } from "../services/threads.js";
import { businessDaysAgo } from "../services/sla.js";

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

async function clientStats() {
  const clients = await DomainFilter.find().sort({ name: 1 }).lean();
  if (!clients.length) return [];

  const rows = await Promise.all(
    clients.map(async (c) => {
      const domainRe = new RegExp(`@${escapeRegex(c.domain)}$`, "i");
      const threadIds = await Message.distinct("threadId", {
        isIncoming: true,
        fromEmail: domainRe,
      });
      const participantIds = await Thread.distinct("_id", {
        participants: { $elemMatch: { $regex: domainRe } },
      });
      const idSet = [...new Set([...threadIds, ...participantIds.map(String)])];

      let toRespond = 0;
      let waiting = 0;
      let open = 0;
      if (idSet.length) {
        const statusGroups = await Thread.aggregate([
          {
            $match: {
              _id: { $in: idSet },
              isNoise: { $ne: true },
            },
          },
          { $group: { _id: "$status", c: { $sum: 1 } } },
        ]);
        const byStatus = Object.fromEntries(statusGroups.map((r) => [r._id, r.c]));
        toRespond = byStatus.to_respond || 0;
        waiting = byStatus.waiting || 0;
        open = toRespond + waiting;
      }

      return {
        id: c._id,
        name: c.name,
        domain: c.domain,
        color: c.color,
        count: open,
        percent: 0,
        replied: waiting,
        notReplied: toRespond,
        toRespond,
        waiting,
        open,
        repliedPercent: open ? Math.round((waiting / open) * 100) : 0,
      };
    })
  );

  const totalOpen = rows.reduce((s, r) => s + r.open, 0) || 1;
  for (const r of rows) {
    r.percent = Math.round((r.open / totalOpen) * 1000) / 10;
  }

  return rows.sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

router.get("/overview", async (_req, res) => {
  try {
    const todayStart = startOfDay();
    const weekStart = startOfWeek();
    const overdueDays = Number((await getSetting("overdue_business_days")) || 2);
    const cutoff = businessDaysAgo(overdueDays);

    const openFilter = { isNoise: { $ne: true }, status: { $in: ["to_respond", "waiting"] } };

    const [
      totalToday,
      totalWeek,
      statusCounts,
      avgArr,
      tags,
      oldest,
      overdueCount,
      closedThisWeek,
      unfiled,
      noiseCount,
    ] = await Promise.all([
      Thread.countDocuments({ firstIncomingAt: { $gte: todayStart } }),
      Thread.countDocuments({ firstIncomingAt: { $gte: weekStart } }),
      Thread.aggregate([
        { $match: { isNoise: { $ne: true } } },
        { $group: { _id: "$status", c: { $sum: 1 } } },
      ]),
      Thread.aggregate([
        { $match: { replyTimeSeconds: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: "$replyTimeSeconds" } } },
      ]),
      Tag.find().lean(),
      Thread.findOne({
        status: "to_respond",
        isNoise: { $ne: true },
      })
        .sort({ firstIncomingAt: 1 })
        .lean(),
      Thread.countDocuments({
        status: "to_respond",
        isNoise: { $ne: true },
        firstIncomingAt: { $lte: cutoff },
      }),
      Thread.countDocuments({
        status: "done",
        closedAt: { $gte: weekStart },
      }),
      Thread.countDocuments({
        ...openFilter,
        $and: [
          { $or: [{ tagIds: { $size: 0 } }, { tagIds: { $exists: false } }] },
          { $or: [{ category: null }, { category: "" }, { category: { $exists: false } }] },
        ],
      }),
      Thread.countDocuments({ isNoise: true }),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((r) => [r._id, r.c]));
    const toRespond = byStatus.to_respond || 0;
    const waiting = byStatus.waiting || 0;
    const done = byStatus.done || 0;
    const total = statusCounts.reduce((s, r) => s + r.c, 0);
    const totalSafe = total || 1;
    const open = toRespond + waiting;

    // 7-day trend: new open vs closed per day
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const [opened, closed] = await Promise.all([
        Thread.countDocuments({
          firstIncomingAt: { $gte: day, $lt: next },
          isNoise: { $ne: true },
        }),
        Thread.countDocuments({
          closedAt: { $gte: day, $lt: next },
        }),
      ]);
      trend.push({
        date: day.toISOString().slice(0, 10),
        opened,
        closed,
      });
    }

    const tagCounts = await Thread.aggregate([
      { $match: openFilter },
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
        percent: Math.round(((countMap[t._id] || 0) / Math.max(open, 1)) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count);

    const byClient = await clientStats();

    let oldestUnanswered = null;
    if (oldest) {
      const enriched = await enrichThreads([oldest]);
      oldestUnanswered = enriched[0];
    }

    res.json({
      totalToday,
      totalWeek,
      total,
      open,
      toRespond,
      waiting,
      done,
      replied: waiting,
      notReplied: toRespond,
      repliedPercent: open ? Math.round((waiting / open) * 100) : 0,
      notRepliedPercent: open ? Math.round((toRespond / open) * 100) : 0,
      avgReplyTimeSeconds: avgArr[0]?.avg ? Math.round(avgArr[0].avg) : null,
      byTag,
      byClient,
      byStatus,
      oldestUnanswered,
      overdueCount,
      overdue: overdueCount,
      closedThisWeek,
      unfiled,
      noiseCount,
      trend,
      thresholdHours: overdueDays * 24,
      overdueBusinessDays: overdueDays,
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
          status: { $in: ["to_respond", "waiting"] },
          isNoise: { $ne: true },
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
