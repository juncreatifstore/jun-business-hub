import "server-only";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextNumber, DOC_PREFIX } from "@/lib/sequence";
import { sha256 } from "@/lib/hash";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { formatMoney } from "@/lib/utils";
import { emptyToNull } from "@/lib/validation";

/**
 * AI creation executors — draft-only side effects (documents in DRAFT, unassigned tasks).
 * Sensitive actions (finalize, sign, send, approve) NEVER live here: they go through
 * the AIAction PROPOSED → APPROVED workflow with human review.
 */

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function createDraftFromAI(
  user: CurrentUser,
  input: { type: string; title: string; body: string; clientId?: string; caseId?: string }
) {
  const clientId = emptyToNull(input.clientId ?? "");
  const caseId = emptyToNull(input.caseId ?? "");
  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return { error: "clientId not found" };
  if (caseId && !(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) return { error: "caseId not found" };

  const html = sanitizeDocumentHtml(
    `<h1>${escapeHtml(input.title)}</h1>` +
      input.body.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join("")
  );
  const documentId = await nextNumber(DOC_PREFIX[input.type] ?? "JUN-DOC");
  const doc = await prisma.document.create({
    data: {
      documentId,
      type: input.type as never,
      title: input.title,
      clientId,
      caseId,
      authorId: user.id,
      versions: { create: { version: 1, content: html, authorId: user.id, changeNote: "AI draft (human review required)", hash: sha256(html) } },
    },
  });
  await audit({ userId: user.id, action: "AI_DOCUMENT_DRAFT_CREATED", resourceType: "Document", resourceId: doc.id, after: { documentId, type: input.type } });
  return { ok: true, id: doc.id, documentId, url: `/app/documents/${doc.id}`, note: "DRAFT created — a human must review and finalize." };
}

export async function createReceiptDraftFromAI(user: CurrentUser, paymentReference: string) {
  const p = await prisma.payment.findUnique({ where: { reference: paymentReference }, include: { client: true, receipt: true } });
  if (!p) return { error: "Payment not found" };
  if (p.status !== "CONFIRMED") return { error: "Payment is not CONFIRMED — a receipt draft needs a confirmed payment" };
  const body = `Received from ${p.client.firstName} ${p.client.lastName} (${p.client.internalId}): ${formatMoney(Number(p.amount), p.currency)} via ${p.method} on ${p.paidAt.toISOString().slice(0, 10)}. Payment reference ${p.reference}.${p.receipt ? ` Official receipt ${p.receipt.reference} already issued.` : ""}`;
  return createDraftFromAI(user, { type: "RECEIPT", title: `Receipt draft — ${p.reference}`, body, clientId: p.clientId, caseId: p.caseId ?? undefined });
}

export async function createTaskFromAI(
  user: CurrentUser,
  input: { title: string; description?: string; caseId?: string; clientId?: string; dueDate?: string }
) {
  const caseId = emptyToNull(input.caseId ?? "");
  const clientId = emptyToNull(input.clientId ?? "");
  if (caseId && !(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) return { error: "caseId not found" };
  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return { error: "clientId not found" };
  const due = input.dueDate ? new Date(input.dueDate) : null;
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      caseId,
      clientId,
      creatorId: user.id,
      assigneeId: null, // AI never assigns work to people
      dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
    },
  });
  await audit({ userId: user.id, action: "AI_TASK_DRAFT_CREATED", resourceType: "Task", resourceId: task.id, after: { title: input.title } });
  return { ok: true, id: task.id, url: "/app/tasks", note: "Task created unassigned — a human assigns it." };
}
