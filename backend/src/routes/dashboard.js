import { Router } from "express";
import { Thread, Message, Tag, User, getSetting } from "../db/models.js";
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
    const total = statusCounts.reduce((s, r) => s + r.c, 0) || 1;
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
      }))
      .sort((a, b) => b.count - a.count);

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
      repliedPercent: Math.round((replied / total) * 100),
      notRepliedPercent: Math.round((notReplied / total) * 100),
      avgReplyTimeSeconds: avgArr[0]?.avg ? Math.round(avgArr[0].avg) : null,
      byTag,
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
