import "dotenv/config";
import { connectDb } from "../src/db/index.js";
import { Message, Thread } from "../src/db/models.js";
import { normalizeBodyText, looksLikeCssDump } from "../src/services/email-body.js";

await connectDb();

const msgs = await Message.find({}).select("_id bodyText bodyHtml threadId").lean();
let fixed = 0;
for (const m of msgs) {
  if (!looksLikeCssDump(m.bodyText) && m.bodyText) continue;
  const cleaned = normalizeBodyText(m.bodyText || "", m.bodyHtml || "", "");
  if (cleaned && cleaned !== m.bodyText) {
    await Message.updateOne({ _id: m._id }, { bodyText: cleaned });
    fixed++;
  }
}
console.log("messages fixed:", fixed, "/", msgs.length);

const threads = await Thread.find({}).select("_id snippet").lean();
let tFixed = 0;
for (const t of threads) {
  if (!looksLikeCssDump(t.snippet)) continue;
  const latest = await Message.findOne({ threadId: t._id })
    .sort({ sentAt: -1 })
    .select("bodyText")
    .lean();
  const snippet = (latest?.bodyText || normalizeBodyText(t.snippet, "", "")).slice(0, 120);
  await Thread.updateOne({ _id: t._id }, { snippet });
  tFixed++;
}
console.log("threads fixed:", tFixed);
process.exit(0);
