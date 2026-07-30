import { Router } from "express";
import { nanoid } from "nanoid";
import { Tag, Thread } from "../db/models.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
router.use(authRequired);

router.get("/", async (_req, res) => {
  try {
    const tags = await Tag.find().sort({ name: 1 }).lean();
    const counts = await Thread.aggregate([
      { $unwind: "$tagIds" },
      { $group: { _id: "$tagIds", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    res.json({
      tags: tags.map((t) => ({
        id: t._id,
        name: t.name,
        color: t.color,
        description: t.description,
        createdBy: t.createdBy ? { id: t.createdBy } : null,
        threadCount: countMap[t._id] || 0,
        createdAt: t.createdAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, color, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const existing = await Tag.findOne({ name: new RegExp(`^${name.trim()}$`, "i") });
    if (existing) return res.status(409).json({ error: "Tag already exists" });

    const tag = await Tag.create({
      _id: nanoid(),
      name: name.trim(),
      color: color || "#3b82f6",
      description: description || null,
      createdBy: req.user.id,
    });

    res.status(201).json({
      tag: {
        id: tag._id,
        name: tag.name,
        color: tag.color,
        description: tag.description,
        threadCount: 0,
        createdAt: tag.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const tag = await Tag.findById(req.params.id);
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    if (req.body.name?.trim()) tag.name = req.body.name.trim();
    if (req.body.color) tag.color = req.body.color;
    if (req.body.description !== undefined) tag.description = req.body.description;
    await tag.save();

    res.json({
      tag: {
        id: tag._id,
        name: tag.name,
        color: tag.color,
        description: tag.description,
        createdAt: tag.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const tag = await Tag.findByIdAndDelete(req.params.id);
    if (!tag) return res.status(404).json({ error: "Tag not found" });
    await Thread.updateMany({}, { $pull: { tagIds: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-apply", async (req, res) => {
  try {
    const { tagId, threadIds } = req.body || {};
    if (!tagId || !Array.isArray(threadIds) || threadIds.length === 0) {
      return res.status(400).json({ error: "tagId and threadIds required" });
    }
    const tag = await Tag.findById(tagId);
    if (!tag) return res.status(404).json({ error: "Tag not found" });

    await Thread.updateMany(
      { _id: { $in: threadIds } },
      { $addToSet: { tagIds: tagId } }
    );
    res.json({ ok: true, applied: threadIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
