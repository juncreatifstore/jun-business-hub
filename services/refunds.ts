"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { refundSchema, emptyToNull } from "@/lib/validation";
import { nextNumber } from "@/lib/sequence";
import { splitInstallments } from "@/lib/money";
import { getRefundWorkflowMeta, saveRefundWorkflowMeta } from "@/lib/finance-refund-workflow";
import { getRefundInstallmentMeta, saveRefundInstallmentMeta } from "@/lib/finance-refund-installments";
import type { FormState } from "@/services/clients";
import type { RefundStatus } from "@prisma/client";

const transitions: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["CANCELLED"],
  PARTIALLY_PAID: [],
  PAID: [],
  REJECTED: [],
  CANCELLED: [],
};

function scheduleInstallments(amount: number, count: number, firstDueDateRaw: FormDataEntryValue | null) {
  const parts = splitInstallments(amount, count);
  const raw = String(firstDueDateRaw || "").trim();
  const first = raw ? new Date(`${raw}T12:00:00`) : null;
  return parts.map((installment, index) => {
    let dueDate = installment.dueDate;
    if (first && !Number.isNaN(first.getTime())) {
      const d = new Date(first);
      d.setMonth(first.getMonth() + index);
      dueDate = d;
    }
    return { ...installment, dueDate, number: index + 1 };
  });
}

async function recomputePaymentRefundStatus(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: { include: { installments: true } } },
  });
  if (!payment) return;
  const paidTotal = payment.refunds.reduce((sum, refund) => sum + refund.installments.filter((i) => i.status === "PAID").reduce((s, i) => s + Number(i.amount), 0), 0);
  const rounded = Math.round(paidTotal * 100) / 100;
  const amount = Number(payment.amount);
  if (rounded <= 0) return;
  const status = rounded >= amount - 0.005 ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (payment.status !== status) await prisma.payment.update({ where: { id: paymentId }, data: { status } });
}

export async function createRefundWorkflow(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("REFUND_CREATE");
  const parsed = refundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;
  const caseId = emptyToNull(d.caseId);
  const paymentId = emptyToNull(d.paymentId);

  const client = await prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } });
  if (!client) return { message: "Selected client does not exist." };
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
    if (!linkedCase) return { message: "Selected case does not exist." };
    if (linkedCase.clientId !== d.clientId) return { message: "Selected case belongs to a different client." };
  }

  const refundNumber = await nextNumber("REF");
  let refundType: "FULL" | "PARTIAL" | "UNLINKED" = "UNLINKED";
  let refund: { id: string; refundNumber: string; currency: string; caseId: string | null };
  const installments = scheduleInstallments(d.amount, d.installments, formData.get("firstDueDate"));

  if (paymentId) {
    try {
      refund = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${paymentId}))`;
        const original = await tx.payment.findUnique({ where: { id: paymentId }, include: { refunds: true } });
        if (!original) throw new Error("Original payment not found.");
        if (original.clientId !== d.clientId) throw new Error("Original payment belongs to a different client.");
        if (!["CONFIRMED", "PARTIALLY_REFUNDED"].includes(original.status)) throw new Error("Only confirmed payments can be refunded.");
        if (original.currency.toUpperCase() !== d.currency.toUpperCase()) throw new Error(`Refund currency must match the original payment (${original.currency}).`);
        const committed = original.refunds.filter((r) => !["REJECTED", "CANCELLED"].includes(r.status)).reduce((sum, r) => sum + Number(r.amount), 0);
        const available = Math.max(0, Math.round((Number(original.amount) - committed) * 100) / 100);
        if (d.amount > available + 0.005) throw new Error(`Refund exceeds the available amount on ${original.reference}: ${original.currency} ${available.toFixed(2)} remaining.`);
        refundType = Math.abs(d.amount - available) < 0.005 ? "FULL" : "PARTIAL";
        return tx.refund.create({ data: { refundNumber, clientId: d.clientId, caseId, paymentId, amount: d.amount, currency: original.currency, reason: d.reason, createdById: user.id, installments: { create: installments } }, select: { id: true, refundNumber: true, currency: true, caseId: true } });
      });
    } catch (error) {
      return { message: error instanceof Error ? error.message : "Unable to create refund." };
    }
  } else {
    refund = await prisma.refund.create({ data: { refundNumber, clientId: d.clientId, caseId, amount: d.amount, currency: d.currency.toUpperCase(), reason: d.reason, createdById: user.id, installments: { create: installments } }, select: { id: true, refundNumber: true, currency: true, caseId: true } });
  }

  await saveRefundWorkflowMeta(refund.id, { refundType });
  await audit({ userId: user.id, action: "REFUND_CREATE", resourceType: "Refund", resourceId: refund.id, after: { refundNumber, amount: d.amount, currency: refund.currency, installments: d.installments, firstDueDate: String(formData.get("firstDueDate") || "") || null, paymentId, refundType } });
  await logActivity({ type: "REFUND_REQUESTED", message: `Refund ${refundNumber} requested (${refund.currency} ${d.amount})`, userId: user.id, clientId: d.clientId, caseId: refund.caseId });
  redirect(`/app/finance/refunds/${refund.id}?toast=${encodeURIComponent("Refund request created")}`);
}

export async function updateRefundReview(refundId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");
  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund || !["REQUESTED", "UNDER_REVIEW"].includes(refund.status)) return;
  const assignedToId = String(formData.get("assignedToId") || "") || null;
  const reviewNotes = String(formData.get("reviewNotes") || "").trim().slice(0, 4000);
  if (assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: assignedToId }, select: { id: true, status: true } });
    if (!assignee || assignee.status !== "ACTIVE") return;
  }
  const before = await getRefundWorkflowMeta(refundId);
  await saveRefundWorkflowMeta(refundId, { assignedToId, reviewNotes, reviewedAt: new Date().toISOString(), reviewedById: user.id });
  if (refund.status === "REQUESTED") await prisma.refund.update({ where: { id: refundId }, data: { status: "UNDER_REVIEW" } });
  await audit({ userId: user.id, action: "REFUND_REVIEW_UPDATE", resourceType: "Refund", resourceId: refundId, before: { assignedToId: before.assignedToId, reviewNotes: before.reviewNotes, status: refund.status }, after: { assignedToId, reviewNotes, status: "UNDER_REVIEW" } });
  revalidatePath(`/app/finance/refunds/${refundId}`);
  revalidatePath("/app/finance/refunds");
}

export async function decideRefund(refundId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");
  const target = String(formData.get("status") || "") as RefundStatus;
  const decisionReason = String(formData.get("decisionReason") || "").trim().slice(0, 3000);
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { installments: true } });
  if (!refund || !transitions[refund.status]?.includes(target)) return;
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(target) && !decisionReason) return;
  if (target === "CANCELLED" && refund.installments.some((i) => i.status === "PAID")) return;

  await prisma.refund.update({ where: { id: refundId }, data: { status: target, ...(target === "APPROVED" ? { approvedById: user.id } : {}) } });
  await saveRefundWorkflowMeta(refundId, { decisionReason, decidedAt: new Date().toISOString(), decidedById: user.id });
  await audit({ userId: user.id, action: `REFUND_${target}`, resourceType: "Refund", resourceId: refundId, before: { status: refund.status }, after: { status: target, decisionReason } });
  await logActivity({ type: "REFUND_UPDATED", message: `Refund ${refund.refundNumber} → ${target.replaceAll("_", " ")}`, userId: user.id, clientId: refund.clientId, caseId: refund.caseId });
  if (target === "APPROVED") await prisma.notification.create({ data: { userId: refund.createdById, type: "REFUND_APPROVED", title: `Refund ${refund.refundNumber} approved`, body: decisionReason } });
  revalidatePath(`/app/finance/refunds/${refundId}`);
  revalidatePath("/app/finance/refunds");
}

export async function rescheduleRefundInstallment(installmentId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");
  const raw = String(formData.get("dueDate") || "").trim();
  const dueDate = raw ? new Date(`${raw}T12:00:00`) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) return;
  const inst = await prisma.refundInstallment.findUnique({ where: { id: installmentId }, include: { refund: true } });
  if (!inst || ["PAID", "CANCELLED"].includes(inst.status) || ["PAID", "REJECTED", "CANCELLED"].includes(inst.refund.status)) return;
  const nextStatus = dueDate.getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime() ? "LATE" : "SCHEDULED";
  await prisma.refundInstallment.update({ where: { id: installmentId }, data: { dueDate, status: nextStatus } });
  await audit({ userId: user.id, action: "REFUND_INSTALLMENT_RESCHEDULE", resourceType: "RefundInstallment", resourceId: installmentId, before: { dueDate: inst.dueDate, status: inst.status }, after: { dueDate, status: nextStatus } });
  revalidatePath(`/app/finance/refunds/${inst.refundId}`);
  revalidatePath("/app/finance/refunds");
}

export async function saveRefundInstallmentPayout(installmentId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");
  const inst = await prisma.refundInstallment.findUnique({ where: { id: installmentId }, include: { refund: true } });
  if (!inst || inst.status === "PAID" || !["APPROVED", "PARTIALLY_PAID"].includes(inst.refund.status)) return;
  const method = String(formData.get("method") || "").trim().slice(0, 80);
  const transactionRef = String(formData.get("transactionRef") || "").trim().slice(0, 180);
  const notes = String(formData.get("notes") || "").trim().slice(0, 2000) || null;
  if (!method || !transactionRef) return;
  const before = await getRefundInstallmentMeta(installmentId);
  await saveRefundInstallmentMeta(installmentId, { method, transactionRef, notes });
  await audit({ userId: user.id, action: "REFUND_INSTALLMENT_PAYOUT_DETAILS", resourceType: "RefundInstallment", resourceId: installmentId, before: { method: before.method, transactionRef: before.transactionRef }, after: { method, transactionRef, notes } });
  revalidatePath(`/app/finance/refunds/${inst.refundId}`);
}

export async function sendRefundInstallmentReminder(installmentId: string) {
  const user = await assertPermission("REFUND_APPROVE");
  const inst = await prisma.refundInstallment.findUnique({ where: { id: installmentId }, include: { refund: true } });
  if (!inst || ["PAID", "CANCELLED"].includes(inst.status)) return;
  const workflow = await getRefundWorkflowMeta(inst.refundId);
  const meta = await getRefundInstallmentMeta(installmentId);
  const recipients = new Set<string>([inst.refund.createdById]);
  if (workflow.assignedToId) recipients.add(workflow.assignedToId);
  const account = await prisma.clientAccount.findFirst({ where: { clientId: inst.refund.clientId }, select: { userId: true } });
  if (account?.userId) recipients.add(account.userId);
  const title = `Refund ${inst.refund.refundNumber} installment ${inst.number}`;
  const body = `Scheduled ${inst.refund.currency} ${Number(inst.amount).toFixed(2)} · due ${inst.dueDate.toISOString().slice(0, 10)}.`;
  await prisma.notification.createMany({ data: [...recipients].map((userId) => ({ userId, type: "REFUND_INSTALLMENT_REMINDER", title, body })) });
  await saveRefundInstallmentMeta(installmentId, { reminderCount: meta.reminderCount + 1, lastReminderAt: new Date().toISOString() });
  await audit({ userId: user.id, action: "REFUND_INSTALLMENT_REMINDER", resourceType: "RefundInstallment", resourceId: installmentId, after: { recipients: recipients.size, reminderCount: meta.reminderCount + 1 } });
  revalidatePath(`/app/finance/refunds/${inst.refundId}`);
}

export async function markRefundInstallmentPaid(installmentId: string) {
  const user = await assertPermission("REFUND_APPROVE");
  const inst = await prisma.refundInstallment.findUnique({ where: { id: installmentId }, include: { refund: { include: { installments: true } } } });
  if (!inst || inst.status === "PAID" || !["APPROVED", "PARTIALLY_PAID"].includes(inst.refund.status)) return;
  const meta = await getRefundInstallmentMeta(installmentId);
  if (!meta.method || !meta.transactionRef || !meta.proofFileId) return;
  const proof = await prisma.file.findFirst({ where: { id: meta.proofFileId, refundId: inst.refundId, archivedAt: null }, select: { id: true } });
  if (!proof) return;

  await prisma.refundInstallment.update({ where: { id: installmentId }, data: { status: "PAID", paidAt: new Date() } });
  const remaining = inst.refund.installments.filter((i) => i.id !== installmentId && !["PAID", "CANCELLED"].includes(i.status)).length;
  const newStatus: RefundStatus = remaining === 0 ? "PAID" : "PARTIALLY_PAID";
  await prisma.refund.update({ where: { id: inst.refundId }, data: { status: newStatus } });
  if (inst.refund.paymentId) await recomputePaymentRefundStatus(inst.refund.paymentId);
  await audit({ userId: user.id, action: "REFUND_INSTALLMENT_PAID", resourceType: "RefundInstallment", resourceId: installmentId, after: { refund: inst.refund.refundNumber, amount: Number(inst.amount), newStatus, method: meta.method, transactionRef: meta.transactionRef, proofFileId: meta.proofFileId } });
  await logActivity({ type: "REFUND_UPDATED", message: `Refund payment recorded on ${inst.refund.refundNumber} (${newStatus.replaceAll("_", " ")})`, userId: user.id, clientId: inst.refund.clientId, caseId: inst.refund.caseId });
  revalidatePath(`/app/finance/refunds/${inst.refundId}`);
  revalidatePath("/app/finance/refunds");
  revalidatePath("/app/finance/payments");
  if (inst.refund.paymentId) revalidatePath(`/app/finance/payments/${inst.refund.paymentId}`);
}
