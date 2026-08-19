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
  "CASE_READ", "CASE_CREATE", "CASE_UPDATE",
  "TASK_READ", "TASK_CREATE", "TASK_UPDATE",
  "DOCUMENT_READ", "DOCUMENT_CREATE", "DOCUMENT_EDIT", "DOCUMENT_DELETE", "DOCUMENT_SIGN",
  "FILE_READ", "FILE_UPLOAD", "FILE_DELETE",
  "VAULT_READ", "VAULT_MANAGE",
  "PAYMENT_READ", "PAYMENT_CREATE", "PAYMENT_APPROVE",
  "REFUND_READ", "REFUND_CREATE", "REFUND_APPROVE",
  "EMAIL_READ", "EMAIL_DRAFT", "EMAIL_SEND",
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
  await prisma.case.create({
    data: {
      caseNumber: num("CASE"), clientId: kevin.id, type: "BUSINESS",
      title: "LLC formation assistance", status: "WAITING_CLIENT", priority: "LOW",
      ownerId: admin.id, members: { create: [{ userId: admin.id }] },
    },
  });

  await prisma.caseNote.create({ data: { caseId: case1.id, authorId: staff.TRAVEL_AGENT.id, body: "Client confirmed travel dates. Waiting on passport scan." } });

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const in3days = new Date(Date.now() + 3 * 86400000);
  const yesterday = new Date(Date.now() - 86400000);
  await prisma.task.createMany({
    data: [
      { title: "Collect passport scan", caseId: case1.id, clientId: aline.id, assigneeId: staff.TRAVEL_AGENT.id, creatorId: admin.id, priority: "HIGH", status: "IN_PROGRESS", dueDate: in3days },
      { title: "Book outbound flight", caseId: case1.id, clientId: aline.id, assigneeId: staff.TRAVEL_AGENT.id, creatorId: admin.id, priority: "MEDIUM", status: "TODO", dueDate: in3days },
      { title: "Send apostille checklist", caseId: case2.id, clientId: thierry.id, assigneeId: staff.DOCUMENT_AGENT.id, creatorId: admin.id, priority: "MEDIUM", status: "TODO", dueDate: yesterday },
    ],
  });

  // ── Finance: payments → receipt, refund + installments ────────────────────
  const pay1 = await prisma.payment.create({
    data: {
      reference: num("PAY"), clientId: aline.id, caseId: case1.id,
      amount: "1850.00", currency: "USD", method: "ZELLE", status: "CONFIRMED",
      notes: "Travel package deposit", createdById: staff.FINANCE.id,
    },
  });
  await prisma.receipt.create({
    data: {
      reference: num("REC"), paymentId: pay1.id, clientId: aline.id,
      amount: "1850.00", currency: "USD", reason: "Travel package deposit — CASE " + case1.caseNumber,
    },
  });
  await prisma.payment.create({
    data: {
      reference: num("PAY"), clientId: thierry.id, caseId: case2.id,
      amount: "420.00", currency: "USD", method: "CASH", status: "PENDING",
      notes: "Apostille service — awaiting confirmation", createdById: staff.FINANCE.id,
    },
  });

  const refund = await prisma.refund.create({
    data: {
      reference: num("REF"), clientId: aline.id, caseId: case1.id, paymentId: pay1.id,
      amount: "300.00", currency: "USD", reason: "Hotel category downgrade — partial refund agreed",
      status: "APPROVED", createdById: staff.FINANCE.id, approvedById: admin.id, approvedAt: new Date(),
    },
  });
  const firstDue = new Date(); firstDue.setMonth(firstDue.getMonth() + 1); firstDue.setDate(1);
  const secondDue = new Date(firstDue); secondDue.setMonth(secondDue.getMonth() + 1);
  await prisma.refundInstallment.createMany({
    data: [
      { refundId: refund.id, dueDate: firstDue, amount: "150.00", status: "SCHEDULED" },
      { refundId: refund.id, dueDate: secondDue, amount: "150.00", status: "SCHEDULED" },
    ],
  });

  // ── Documents: template + contract with versions ───────────────────────────
  await prisma.documentTemplate.create({
    data: {
      name: "Service contract (standard)",
      type: "CONTRACT",
      content: "<h1>Service Contract</h1><p>Between <strong>JUN CREATIF AND TRAVEL LLC</strong> and <strong>{{client_name}}</strong>.</p><h2>Scope</h2><p>{{scope}}</p><h2>Fees</h2><p>{{fees}}</p><p>Signed on {{date}}.</p>",
    },
  });

  const contractHtml = `<h1>Service Contract</h1><p>Between <strong>JUN CREATIF AND TRAVEL LLC</strong> and <strong>Aline Mabiala</strong>.</p><h2>Scope</h2><p>Travel package: visa assistance and round-trip flights to Libreville.</p><h2>Fees</h2><p>USD 1,850.00 — deposit received.</p>`;
  const contract = await prisma.document.create({
    data: {
      documentId: num("JUN-CTR"), type: "CONTRACT", title: "Travel service contract — Aline Mabiala",
      status: "FINAL", clientId: aline.id, caseId: case1.id, authorId: admin.id,
      finalHash: sha256(contractHtml), finalizedAt: new Date(),
      versions: {
        create: [
          { version: 1, content: "<h1>Service Contract</h1><p>Draft.</p>", authorId: admin.id, changeNote: "Initial draft", hash: sha256("<h1>Service Contract</h1><p>Draft.</p>") },
          { version: 2, content: contractHtml, authorId: admin.id, changeNote: "Final terms", hash: sha256(contractHtml), status: "FINAL" },
        ],
      },
    },
  });

  const receiptDocHtml = `<h1>Payment Receipt</h1><p>Received from <strong>Thierry Essono</strong>: USD 420.00 (pending confirmation).</p>`;
  await prisma.document.create({
    data: {
      documentId: num("JUN-RCP"), type: "RECEIPT", title: "Receipt draft — Thierry Essono",
      status: "DRAFT", clientId: thierry.id, caseId: case2.id, authorId: staff.FINANCE.id,
      versions: { create: [{ version: 1, content: receiptDocHtml, authorId: staff.FINANCE.id, changeNote: "Initial draft", hash: sha256(receiptDocHtml) }] },
    },
  });

  // ── Mail sample thread ─────────────────────────────────────────────────────
  await prisma.emailThread.create({
    data: {
      subject: "Your travel documents are ready",
      clientId: aline.id, caseId: case1.id, folder: "DRAFTS", aiLevel: "APPROVAL_REQUIRED",
      aiSummary: "Needs human approval before automated handling",
      messages: { create: [{ fromAddr: "admin@juncreatif.org", toAddr: "aline.mabiala@example.com", body: "Hello Aline,\n\nYour visa support letter is finalized. You can verify it anytime at /verify/" + contract.documentId + ".\n\nBest regards,\nJUN CREATIF AND TRAVEL LLC", isDraft: true }] },
    },
  });

  // ── Notifications ──────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { userId: staff.TRAVEL_AGENT.id, type: "TASK_ASSIGNED", title: "New task: Collect passport scan", href: "/app/tasks" },
      { userId: admin.id, type: "PAYMENT_CONFIRMED", title: `Payment ${pay1.reference} confirmed`, body: "USD 1,850.00 — receipt issued.", href: "/app/finance/payments" },
    ],
  });

  console.log("✔ Seed complete.");
  console.log("  Staff login:   admin@juncreatif.org / " + adminPassword);
  console.log("  Portal login:  aline.portal@example.com / ChangeMe123!");
  console.log("  ⚠ Change these passwords outside local development.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
