import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { User, Tag } from "./models.js";

const TEAM = [
  { name: "Diwakar", email: "diwakar@gatpsolutions.com", password: "password123", role: "admin" },
  { name: "Alex Rivera", email: "alex@company.com", password: "password123", role: "admin" },
  { name: "Jordan Lee", email: "jordan@company.com", password: "password123", role: "member" },
  { name: "Sam Patel", email: "sam@company.com", password: "password123", role: "member" },
  { name: "Casey Morgan", email: "casey@company.com", password: "password123", role: "member" },
];

const TAGS = [
  { name: "projectA", color: "#2563eb", description: "Project A client work" },
  { name: "clientX", color: "#16a34a", description: "Client X account" },
  { name: "billing", color: "#ca8a04", description: "Billing & invoices" },
  { name: "support", color: "#dc2626", description: "General support" },
  { name: "onboarding", color: "#7c3aed", description: "New customer onboarding" },
];

export async function seed() {
  let adminId = null;

  for (const t of TEAM) {
    const hash = bcrypt.hashSync(t.password, 10);
    const user = await User.findOneAndUpdate(
      { email: t.email.toLowerCase() },
      {
        $setOnInsert: {
          _id: nanoid(),
          name: t.name,
          email: t.email.toLowerCase(),
          passwordHash: hash,
          role: t.role,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    if (t.email === "diwakar@gatpsolutions.com") adminId = user._id;
  }

  for (const t of TAGS) {
    await Tag.findOneAndUpdate(
      { name: t.name },
      {
        $setOnInsert: {
          _id: nanoid(),
          name: t.name,
          color: t.color,
          description: t.description,
          createdBy: adminId,
        },
      },
      { upsert: true }
    );
  }

  console.log("MongoDB seed ready (users + tags).");
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("db/seed.js")) {
  const { connectDb } = await import("./index.js");
  await connectDb();
  await seed();
  process.exit(0);
}
