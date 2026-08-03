import mongoose from "mongoose";
import { Setting, Thread } from "./models.js";

const DEFAULTS = {
  overdue_business_days: "2",
  unanswered_threshold_hours: "4", // legacy; overdue_business_days preferred
  shared_inbox_email: "support@company.com",
  notify_unanswered: "true",
  provider: "demo",
};

async function migrateThreadStatuses() {
  const col = mongoose.connection.collection("threads");
  const ops = [
    { from: ["not_replied", "needs_followup"], to: "to_respond" },
    { from: ["replied", "replied_by_other"], to: "waiting" },
  ];
  for (const { from, to } of ops) {
    const r = await col.updateMany(
      { status: { $in: from } },
      { $set: { status: to } }
    );
    if (r.modifiedCount) {
      console.log(`[migrate] ${r.modifiedCount} thread(s) → ${to}`);
    }
  }
  // Ensure new fields exist with defaults where missing
  await col.updateMany(
    { isNoise: { $exists: false } },
    { $set: { isNoise: false, gmailLabelIds: [], gmailLabelNames: [] } }
  );
}

export async function connectDb(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/email_tracker";
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${mongoUri}`);

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await Setting.updateOne({ _id: key }, { $setOnInsert: { value } }, { upsert: true });
  }

  try {
    await migrateThreadStatuses();
  } catch (err) {
    console.warn("[migrate] status migration skipped:", err.message);
  }
}

export default mongoose;
