import mongoose from "mongoose";
import { nanoid } from "nanoid";

const id = () => nanoid();

const userSchema = new mongoose.Schema(
  {
    _id: { type: String, default: id },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

const tagSchema = new mongoose.Schema(
  {
    _id: { type: String, default: id },
    name: { type: String, required: true, unique: true, trim: true },
    color: { type: String, default: "#3b82f6" },
    description: { type: String, default: null },
    createdBy: { type: String, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

const threadSchema = new mongoose.Schema(
  {
    _id: { type: String, default: id },
    externalId: { type: String, unique: true, sparse: true },
    subject: { type: String, required: true },
    snippet: { type: String, default: "" },
    participants: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["to_respond", "waiting", "done"],
      default: "to_respond",
    },
    assignedTo: { type: String, ref: "User", default: null },
    tagIds: { type: [String], default: [], ref: "Tag" },
    category: { type: String, default: null },
    isNoise: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    gmailLabelIds: { type: [String], default: [] },
    gmailLabelNames: { type: [String], default: [] },
    latestMessageAt: { type: Date, default: null },
    firstIncomingAt: { type: Date, default: null },
    firstReplyAt: { type: Date, default: null },
    replyTimeSeconds: { type: Number, default: null },
    unread: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

threadSchema.index({ status: 1 });
threadSchema.index({ latestMessageAt: -1 });
threadSchema.index({ firstIncomingAt: 1 });
threadSchema.index({ tagIds: 1 });
threadSchema.index({ isNoise: 1 });
threadSchema.index({ category: 1 });
threadSchema.index({ closedAt: 1 });
threadSchema.index({ assignedTo: 1 });

const messageSchema = new mongoose.Schema(
  {
    _id: { type: String, default: id },
    threadId: { type: String, ref: "Thread", required: true, index: true },
    externalId: { type: String, unique: true, sparse: true },
    fromEmail: { type: String, required: true },
    fromName: { type: String, default: "" },
    toEmails: { type: [String], default: [] },
    ccEmails: { type: [String], default: [] },
    bodyText: { type: String, default: "" },
    bodyHtml: { type: String, default: "" },
    sentAt: { type: Date, required: true, index: true },
    isIncoming: { type: Boolean, default: true },
    repliedBy: { type: String, ref: "User", default: null },
    detectedSuffix: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

const settingSchema = new mongoose.Schema(
  {
    _id: { type: String }, // key
    value: { type: String, required: true },
  },
  { versionKey: false }
);

const notificationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: id },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    threadId: { type: String, ref: "Thread", default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

/** Saved client domain filters — e.g. acmecorp.com */
const domainFilterSchema = new mongoose.Schema(
  {
    _id: { type: String, default: id },
    name: { type: String, required: true, trim: true },
    domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    color: { type: String, default: "#0f766e" },
    notes: { type: String, default: "" },
    createdBy: { type: String, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true }, versionKey: false }
);

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Tag = mongoose.models.Tag || mongoose.model("Tag", tagSchema);
export const Thread = mongoose.models.Thread || mongoose.model("Thread", threadSchema);
export const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);
export const Setting =
  mongoose.models.Setting || mongoose.model("Setting", settingSchema);
export const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export const DomainFilter =
  mongoose.models.DomainFilter || mongoose.model("DomainFilter", domainFilterSchema);

export async function getSetting(key, fallback = null) {
  const row = await Setting.findById(key).lean();
  return row?.value ?? fallback;
}

export async function setSetting(key, value) {
  await Setting.findByIdAndUpdate(
    key,
    { _id: key, value: String(value) },
    { upsert: true, new: true }
  );
}

export async function getAllSettings() {
  const rows = await Setting.find().lean();
  return Object.fromEntries(rows.map((r) => [r._id, r.value]));
}
