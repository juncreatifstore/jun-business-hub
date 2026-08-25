// Development seed for JUN Business Hub.
// Run with: npm run db:seed  (after `prisma migrate dev` / `prisma db push`)
//
// ⚠ DEV ONLY. Creates admin@juncreatif.org with password "ChangeMe123!".
// Change this password immediately in production (Team > Reset password),
// or set SEED_ADMIN_PASSWORD before seeding. All client data below is fictitious.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

const year = new Date().getFullYear();
const counters = {};
function num(prefix, width = 6) {
  const id = `${prefix}-${year}`;
  counters[id] = (counters[id] ?? 0) + 1;
  return `${id}-${String(counters[id]).padStart(width, "0")}`;
}

// Mirror of lib/permissions.ts (kept in sync manually — pure data).
const PERMISSIONS = [
  "CLIENT_READ", "CLIENT_CREATE", "CLIENT_UPDATE", "CLIENT_ARCHIVE",
  "CASE_READ", "CASE_CREATE", "CASE_UPDATE", "CASE_ADMIN",
  "TASK_READ", "TASK_CREATE", "TASK_UPDATE",
  "DOCUMENT_READ", "DOCUMENT_CREATE", "DOCUMENT_EDIT", "DOCUMENT_DELETE", "DOCUMENT_SIGN",
  "FILE_READ", "FILE_UPLOAD", "FILE_DELETE",
  "VAULT_READ", "VAULT_MANAGE",
  "PAYMENT_READ", "PAYMENT_CREATE", "PAYMENT_APPROVE",
  "REFUND_READ", "REFUND_CREATE", "REFUND_APPROVE",
  "EXPENSE_READ", "EXPENSE_CREATE", "EXPENSE_APPROVE",
  "INVOICE_READ", "INVOICE_CREATE", "INVOICE_APPROVE",
  "ACCOUNTING_READ", "ACCOUNTING_POST", "ACCOUNTING_CLOSE",
  "BANK_RECON_READ", "BANK_RECON_IMPORT", "BANK_RECON_APPROVE", "BANK_RECON_CLOSE",
  "BUDGET_READ", "BUDGET_CREATE", "BUDGET_APPROVE",
  "EMAIL_READ", "EMAIL_DRAFT", "EMAIL_SEND", "EMAIL_MANAGE", "EMAIL_ACCOUNT_ACCESS",
  "AI_USE", "AI_APPROVE",
  "TEAM_MANAGE", "SETTINGS_MANAGE", "AUDIT_READ",
];

const DEPARTMENTS = [
  ["EXECUTIVE", "Executive"],
  ["ADMINISTRATION", "Administration"],
  ["FINANCE", "Finance"],
  ["TRAVEL", "Travel Services"],
  ["DOCUMENTS", "Documents & Immigration"],
  ["LEGAL", "Legal"],
  ["ACCOUNTING", "Accounting"],
  ["CUSTOMER_SERVICE", "Customer Service"],
  ["TECHNOLOGY", "Technology"],
];

const ROLES = [
  ["SUPER_ADMIN", "Super Admin"], ["DIRECTOR", "Director"], ["ADMIN", "Admin"],
  ["MANAGER", "Manager"], ["FINANCE", "Finance"], ["TRAVEL_AGENT", "Travel Agent"],
  ["DOCUMENT_AGENT", "Document Agent"], ["LEGAL", "Legal"], ["ACCOUNTANT", "Accountant"],
  ["AUDITOR", "Auditor"], ["VIEWER", "Viewer"], ["CLIENT", "Client (portal)"],
];

async function main() {
  console.log("→ Seeding JUN Business Hub (dev data)…");

  // Reference tables (idempotent upserts)
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, label: code.replaceAll("_", " ") } });
  }
  for (const [name, label] of ROLES) {
    await prisma.role.upsert({ where: { name }, update: { label }, create: { name, label } });
  }
  const departments = {};
  for (const [name, label] of DEPARTMENTS) {
    departments[name] = await prisma.department.upsert({ where: { name }, update: { label }, create: { name, label } });
  }

  // ── Staff ──────────────────────────────────────────────────────────────────
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const admin = await prisma.user.upsert({
    where: { email: "admin@juncreatif.org" },
    update: {},
    create: {
      email: "admin@juncreatif.org",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      firstName: "Junior",
      lastName: "Nguema",
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      departmentId: departments.EXECUTIVE.id,
    },
  });

  const staffDefs = [
    ["marie.finance@juncreatif.org", "Marie", "Okoro", "FINANCE", "FINANCE"],
    ["paul.travel@juncreatif.org", "Paul", "Mba", "TRAVEL_AGENT", "TRAVEL"],
    ["ines.docs@juncreatif.org", "Inès", "Ondo", "DOCUMENT_AGENT", "DOCUMENTS"],
  ];
  const staff = { admin };
  for (const [email, firstName, lastName, role, dept] of staffDefs) {
    staff[role] = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email, firstName, lastName, role, status: "ACTIVE",
        passwordHash: await bcrypt.hash("ChangeMe123!", 12),
        departmentId: departments[dept].id,
      },
    });
  }

  // Idempotency: if demo clients already exist, stop after reference data.
  const existing = await prisma.client.count();
  if (existing > 0) {
    console.log("→ Demo data already present — reference tables refreshed, skipping fixtures.");
    return;
  }

  // ── Clients (fictitious) ───────────────────────────────────────────────────
  const clientDefs = [
    ["Aline", "Mabiala", "aline.mabiala@example.com", "+1 555 010 2001", "ACTIVE"],
    ["Thierry", "Essono", "thierry.essono@example.com", "+1 555 010 2002", "ACTIVE"],
    ["Grace", "Ndong", "grace.ndong@example.com", "+1 555 010 2003", "LEAD"],
    ["Kevin", "Obame", "kevin.obame@example.com", "+1 555 010 2004", "ACTIVE"],
  ];
  const clients = [];
  for (const [firstName, lastName, email, phone, status] of clientDefs) {
    clients.push(await prisma.client.create({
      data: { internalId: num("JUN-CLI"), firstName, lastName, email, phone, status, ownerId: admin.id },
    }));
  }
  const [aline, thierry, grace, kevin] = clients;

  // Client portal account for Aline (enabled, password ChangeMe123!)
  const alineUser = await prisma.user.create({
    data: {
      email: "aline.portal@example.com",
      passwordHash: await bcrypt.hash("ChangeMe123!", 12),
      firstName: "Aline", lastName: "Mabiala", role: "CLIENT", status: "ACTIVE",
    },
  });
  await prisma.clientAccount.create({
    data: { clientId: aline.id, userId: alineUser.id, email: alineUser.email, isEnabled: true },
  });

  // ── Cases ──────────────────────────────────────────────────────────────────
  const case1 = await prisma.case.create({
    data: {
      caseNumber: num("CASE"), clientId: aline.id, type: "TRAVEL",
      title: "Round trip Libreville — visa + flights", status: "IN_PROGRESS", priority: "HIGH",
      description: "Full travel package: Schengen visa support and flight booking.",
      ownerId: staff.TRAVEL_AGENT.id,
      members: { create: [{ userId: staff.TRAVEL_AGENT.id }, { userId: admin.id }] },
    },
  });
  const case2 = await prisma.case.create({
    data: {
      caseNumber: num("CASE"), clientId: thierry.id, type: "DOCUMENTS",
      title: "Apostille + translation package", status: "OPEN", priority: "MEDIUM",
      ownerId: staff.DOCUMENT_AGENT.id,
      members: { create: [{ userId: staff.DOCUMENT_AGENT.id }] },
    },
  });
  const case3 = await prisma.case.create({
    data: {
      caseNumber: num("CASE"), clientId: kevin.id, type: "REFUND",
      title: "Partial refund review", status: "WAITING_INTERNAL", priority: "URGENT",
      ownerId: staff.FINANCE.id,
      members: { create: [{ userId: staff.FINANCE.id }, { userId: admin.id }] },
    },
  });

  // ── Tasks ──────────────────────────────────────────────────────────────────
  await prisma.task.createMany({
    data: [
      { title: "Collect remaining visa documents", caseId: case1.id, clientId: aline.id, assigneeId: staff.TRAVEL_AGENT.id, creatorId: admin.id, priority: "HIGH", status: "IN_PROGRESS" },
      { title: "Request certified translation", caseId: case2.id, clientId: thierry.id, assigneeId: staff.DOCUMENT_AGENT.id, creatorId: admin.id, priority: "MEDIUM", status: "TODO" },
      { title: "Review refund eligibility", caseId: case3.id, clientId: kevin.id, assigneeId: staff.FINANCE.id, creatorId: admin.id, priority: "URGENT", status: "IN_PROGRESS" },
    ],
  });

  // ── Payments / Refund ──────────────────────────────────────────────────────
  const payment = await prisma.payment.create({
    data: { reference: num("PAY"), clientId: aline.id, caseId: case1.id, amount: 1200, currency: "USD", method: "ZELLE", status: "CONFIRMED", recordedById: staff.FINANCE.id, paidAt: new Date() },
  });
  const refund = await prisma.refund.create({
    data: { refundNumber: num("REF"), clientId: kevin.id, caseId: case3.id, amount: 450, currency: "USD", reason: "Cancelled service component", status: "APPROVED", createdById: staff.FINANCE.id, approvedById: admin.id },
  });
  await prisma.refundInstallment.createMany({ data: [
    { refundId: refund.id, number: 1, amount: 225, dueDate: new Date(Date.now() + 7 * 86400000), status: "SCHEDULED" },
    { refundId: refund.id, number: 2, amount: 225, dueDate: new Date(Date.now() + 37 * 86400000), status: "SCHEDULED" },
  ] });

  // ── Files / Document ───────────────────────────────────────────────────────
  await prisma.file.create({ data: { name: "passport-aline.pdf", storageKey: "demo/passport-aline.pdf", mimeType: "application/pdf", sizeBytes: 250000, category: "PASSPORT", clientId: aline.id, caseId: case1.id, uploadedById: admin.id } });
  const doc = await prisma.document.create({ data: { documentId: num("DOC"), type: "LETTER", title: "Visa support letter", status: "DRAFT", clientId: aline.id, caseId: case1.id, authorId: admin.id } });
  await prisma.documentVersion.create({ data: { documentId: doc.id, version: 1, content: "Demo visa support letter content.", authorId: admin.id, hash: sha256("Demo visa support letter content."), status: "DRAFT" } });

  // ── Activity / Notification ────────────────────────────────────────────────
  await prisma.activity.create({ data: { type: "SYSTEM", message: "Demo workspace initialized", userId: admin.id } });
  await prisma.notification.create({ data: { userId: admin.id, type: "SYSTEM", title: "Welcome to JUN Business Hub", body: "Development demo data is ready." } });

  console.log("✓ Seed complete.");
  console.log(`  Admin: admin@juncreatif.org / ${adminPassword}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
