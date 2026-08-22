"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { caseSchema, emptyToNull, parseDate, parseTags } from "@/lib/validation";
import { nextNumber } from "@/lib/sequence";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { getClientBlock } from "@/lib/client-transaction-block";
import { listInvoices } from "@/lib/finance-invoices";
import { listFinanceExpenses } from "@/lib/finance-expenses";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

export async function createCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("CASE_CREATE");
  const parsed = caseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const client = await prisma.client.findUnique({ where: { id: d.clientId } });
  if (!client) return { message: "Selected client does not exist." };

  const block = await getClientBlock(d.clientId);
  if (block?.blocked) {
    await audit({ userId: user.id, action: "CASE_CREATE_BLOCKED_CLIENT", resourceType: "Client", resourceId: d.clientId, after: { reason: block.reason } });
    return { message: `New service blocked: JUN ended the commercial relationship with this client. Reason: ${block.reason}` };
  }

  const finance = await getClientFinanceOverview(d.clientId);
  const debts = finance.summaries.filter((s) => s.forecastProfit < -0.009);
  if (debts.length) {
    const debtText = debts.map((s) => `${s.currency} ${Math.abs(s.forecastProfit).toFixed(2)}`).join(" / ");
    await audit({ userId: user.id, action: "CASE_CREATE_BLOCKED_NEGATIVE_CLIENT_BALANCE", resourceType: "Client", resourceId: d.clientId, after: { debt: debtText } });
    return { message: `New service blocked: this client has an outstanding balance of ${debtText}. The debt must be settled or regularized before a new service can be opened.` };
  }

  const caseNumber = await nextNumber("CASE");
  const c = await prisma.case.create({ data: { caseNumber, clientId: d.clientId, type: d.type, title: d.title, description: emptyToNull(d.description), priority: d.priority, status: d.status, dueDate: parseDate(d.dueDate), tags: parseTags(d.tags), ownerId: user.id, members: { create: { userId: user.id } } } });
  await audit({ userId: user.id, action: "CASE_CREATE", resourceType: "Case", resourceId: c.id, after: { caseNumber, title: c.title } });
  await logActivity({ type: "CASE_CREATED", message: `Case ${caseNumber} opened: ${c.title}`, userId: user.id, clientId: d.clientId, caseId: c.id });
  redirect(`/app/cases/${c.id}?toast=${encodeURIComponent("Case created")}`);
}

export async function updateCase(caseId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("CASE_UPDATE");
  const parsed = caseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const before = await prisma.case.findUnique({ where: { id: caseId } });
  if (!before) return { message: "Case not found." };
  const client = await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } });
  if (!client) return { message: "Selected client does not exist." };
  const reason = String(formData.get("correctionReason") || "").trim().slice(0, 1000);
  if (!reason) return { message: "Correction reason is required." };
  const after = await prisma.case.update({ where: { id: caseId }, data: { clientId: d.clientId, type: d.type, title: d.title, description: emptyToNull(d.description), priority: d.priority, status: d.status, dueDate: parseDate(d.dueDate), tags: parseTags(d.tags) } });
  await audit({ userId: user.id, action: "CASE_CORRECTION", resourceType: "Case", resourceId: caseId, before: { clientId: before.clientId, type: before.type, title: before.title, description: before.description, priority: before.priority, status: before.status, dueDate: before.dueDate, tags: before.tags }, after: { clientId: after.clientId, type: after.type, title: after.title, description: after.description, priority: after.priority, status: after.status, dueDate: after.dueDate, tags: after.tags, correctionReason: reason } });
  await logActivity({ type: "CASE_UPDATED", message: `Case ${after.caseNumber} corrected: ${reason}`, userId: user.id, clientId: after.clientId, caseId });
  redirect(`/app/cases/${caseId}?toast=${encodeURIComponent("Case corrected")}`);
}

export async function updateCaseStatus(caseId: string, formData: FormData) {
  const user = await assertPermission("CASE_UPDATE");
  const status = String(formData.get("status") ?? "");
  const allowed = ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "COMPLETED", "CANCELLED", "ARCHIVED"];
  if (!allowed.includes(status)) return;
  const before = await prisma.case.findUnique({ where: { id: caseId } });
  if (!before) return;
  const updated = await prisma.case.update({ where: { id: caseId }, data: { status: status as never } });
  await audit({ userId: user.id, action: "CASE_STATUS_CHANGE", resourceType: "Case", resourceId: caseId, before: { status: before.status }, after: { status } });
  await logActivity({ type: "CASE_UPDATED", message: `Case ${updated.caseNumber} moved to ${status.replaceAll("_", " ")}`, userId: user.id, clientId: updated.clientId, caseId });
  revalidatePath(`/app/cases/${caseId}`);
}

export async function addCaseNote(caseId: string, formData: FormData) {
  const user = await assertPermission("CASE_UPDATE");
  const body = String(formData.get("body") ?? "").trim().slice(0, 5000);
  if (!body) return;
  const c = await prisma.case.findUnique({ where: { id: caseId } });
  if (!c) return;
  await prisma.caseNote.create({ data: { caseId, authorId: user.id, body } });
  await logActivity({ type: "NOTE_ADDED", message: `Note added to ${c.caseNumber}`, userId: user.id, caseId, clientId: c.clientId });
  revalidatePath(`/app/cases/${caseId}`);
}

export async function deleteCase(caseId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("CASE_UPDATE");
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, caseNumber: true, title: true, clientId: true, _count: { select: { payments: true, refunds: true, documents: true, files: true } } } });
  if (!c) redirect("/app/cases?toast_error=Service not found");
  const confirmation = String(formData.get("confirmation") || "").trim().toUpperCase();
  const reason = String(formData.get("reason") || "").trim().slice(0, 1000);
  const expected = `DELETE ${c.caseNumber}`.toUpperCase();
  if (confirmation !== expected) redirect(`/app/cases/${caseId}?toast_error=${encodeURIComponent(`Type ${expected} to confirm deletion.`)}`);
  if (!reason) redirect(`/app/cases/${caseId}?toast_error=${encodeURIComponent("Deletion reason is required.")}`);
  const [invoices, expenses] = await Promise.all([listInvoices(5000), listFinanceExpenses(5000)]);
  const linkedInvoices = invoices.filter((i) => i.caseId === caseId);
  const linkedExpenses = expenses.filter((e) => e.caseId === caseId && !["REJECTED", "CANCELLED"].includes(e.status));
  const blockers: string[] = [];
  if (c._count.payments) blockers.push(`${c._count.payments} payment(s)`);
  if (c._count.refunds) blockers.push(`${c._count.refunds} refund(s)`);
  if (c._count.documents) blockers.push(`${c._count.documents} document(s)`);
  if (c._count.files) blockers.push(`${c._count.files} file(s)`);
  if (linkedInvoices.length) blockers.push(`${linkedInvoices.length} invoice(s)`);
  if (linkedExpenses.length) blockers.push(`${linkedExpenses.length} expense(s)`);
  if (blockers.length) {
    await audit({ userId: user.id, action: "CASE_DELETE_BLOCKED", resourceType: "Case", resourceId: caseId, after: { caseNumber: c.caseNumber, blockers, reason } });
    redirect(`/app/cases/${caseId}?toast_error=${encodeURIComponent(`This service cannot be deleted because it has ${blockers.join(", ")}. Cancel or archive it instead to preserve the financial record.`)}`);
  }
  await audit({ userId: user.id, action: "CASE_DELETE", resourceType: "Case", resourceId: caseId, before: { caseNumber: c.caseNumber, title: c.title, clientId: c.clientId }, after: { reason } });
  await prisma.$transaction(async (tx) => { await tx.task.deleteMany({ where: { caseId } }); await tx.activity.deleteMany({ where: { caseId } }); await tx.caseNote.deleteMany({ where: { caseId } }); await tx.caseMember.deleteMany({ where: { caseId } }); await tx.case.delete({ where: { id: caseId } }); });
  revalidatePath("/app/cases"); revalidatePath(`/app/clients/${c.clientId}`); revalidatePath(`/app/clients/${c.clientId}/dashboard`); revalidatePath(`/app/clients/${c.clientId}/services`);
  redirect(`/app/clients/${c.clientId}/services?toast=${encodeURIComponent(`Service ${c.caseNumber} deleted`)}`);
}
