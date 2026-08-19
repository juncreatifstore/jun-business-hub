// Safe first-SUPER_ADMIN bootstrap for production.
// Usage: SEED_ADMIN_PASSWORD="strong-pass" node scripts/create-admin.mjs email "First" "Last"
// - Refuses to run if a SUPER_ADMIN already exists.
// - Never writes the password anywhere; prints it once only if it generated it.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const [email, firstName = "Admin", lastName = "JUN"] = process.argv.slice(2);
if (!email || !email.includes("@")) {
  console.error("Usage: node scripts/create-admin.mjs email \"First\" \"Last\"");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const existing = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { email: true } });
if (existing) {
  console.error(`A SUPER_ADMIN already exists (${existing.email}). Use Team → Reset password instead.`);
  process.exit(1);
}

const generated = !process.env.SEED_ADMIN_PASSWORD;
const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
if (password.length < 10) {
  console.error("SEED_ADMIN_PASSWORD must be at least 10 characters.");
  process.exit(1);
}

await prisma.user.create({
  data: {
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 12),
    firstName,
    lastName,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  },
});

console.log(`✔ SUPER_ADMIN created: ${email.toLowerCase()}`);
if (generated) console.log(`  Temporary password (shown once): ${password}`);
console.log("  → Sign in, enable MFA (Settings → Security), then change this password.");
await prisma.$disconnect();
