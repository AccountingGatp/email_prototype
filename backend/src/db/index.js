import mongoose from "mongoose";
import { Setting } from "./models.js";

const DEFAULTS = {
  unanswered_threshold_hours: "4",
  shared_inbox_email: "support@company.com",
  notify_unanswered: "true",
  provider: "demo",
};

export async function connectDb(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/email_tracker";
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${mongoUri}`);

  for (const [key, value] of Object.entries(DEFAULTS)) {
    await Setting.updateOne({ _id: key }, { $setOnInsert: { value } }, { upsert: true });
  }
}

export default mongoose;
