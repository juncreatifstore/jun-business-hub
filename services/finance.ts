"use server";
// Finance business logic — all sensitive operations run server-side, are
// permission-checked, audited, and produce activity + notifications.
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { paymentSchema, refundSchema, emptyToNull, parseDate } from "@/lib/validation";
import { nextNumber } from "@/lib/sequence";
import { splitInstallments } from "@/lib/money";
import { savePaymentCoreMeta } from "@/lib/finance-payment-core";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/services/clients";

export async function createPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("PAYMENT_CREATE");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: d.clientId } });
  if (!client) return { message: "Selected client does not exist." };
  const caseId = emptyToNull(d.caseId);
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
    if (!linkedCase) return { message: "Selected case does not exist." };
    if (linkedCase.clientId !== d.clientId) return { message: "Selected case belongs to a different client." };
  }

  const paidAt = parseDate(d.paidAt) ?? new Date();
  try { await assertFinancialPeriodOpen(paidAt); } catch (error) { return { message: error instanceof Error ? error.message : "Financial period is closed." }; }
  const reference = await nextNumber("PAY");
  const payment = await prisma.payment.create({
    data: {
      reference,
      clientId: d.clientId,
      caseId,
      amount: d.amount,
      currency: d.currency.toUpperCase(),
      method: d.method,
      providerRef: emptyToNull(d.providerRef),
      paidAt,
      notes: emptyToNull(d.notes),
      recordedById: user.id,
    },
  });
  const expectedAmount = d.expectedAmount === "" || d.expectedAmount == null ? null : Number(d.expectedAmount);
  await savePaymentCoreMeta(payment.id, {
    expectedAmount,
    serviceLabel: emptyToNull(d.serviceLabel),
    providerRef: emptyToNull(d.providerRef),
  });
  await audit({ userId: user.id, action: "PAYMENT_CREATE", resourceType: "Payment", resourceId: payment.id, after: { reference, amount: d.amount, expectedAmount, currency: payment.currency, method: payment.method, providerRef: payment.providerRef, serviceLabel: emptyToNull(d.serviceLabel), paidAt: payment.paidAt } });
  await logActivity({ type: "PAYMENT_CREATED", message: `Payment ${reference} recorded (${payment.currency} ${d.amount})`, userId: user.id, clientId: d.clientId, caseId: payment.caseId });
  redirect(`/app/finance/payments/${payment.id}?toast=${encodeURIComponent("Payment recorded — pending confirmation")}`);
}

export async function confirmPayment(paymentId: string) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { client: true } });
  if (!payment || payment.status !== "PENDING") return;
  await assertFinancialPeriodOpen(payment.paidAt ?? payment.createdAt);

  const receiptRef = `RCT-${payment.reference}`;
  await prisma.$transaction([
    prisma.payment.update({ where: { id: paymentId }, data: { status: "CONFIRMED" } }),
    prisma.notification.create({
      data: {
        userId: payment.recordedById,
        type: "PAYMENT_CONFIRMED",
        title: `Payment ${payment.reference} confirmed`,
        body: `Receipt ${receiptRef} is available.`,
      },
    }),
  ]);
  await audit({ userId: user.id, action: "PAYMENT_CONFIRM", resourceType: "Payment", resourceId: paymentId, before: { status: "PENDING" }, after: { status: "CONFIRMED", receipt: receiptRef } });
  await logActivity({ type: "PAYMENT_CONFIRMED", message: `Payment ${payment.reference} confirmed · receipt ${receiptRef} available`, userId: user.id, clientId: payment.clientId, caseId: payment.caseId });
  revalidatePath(`/app/finance/payments/${paymentId}`);
  revalidatePath("/app/finance/payments");
  revalidatePath("/app/finance/receipts");
}

export async function rejectPayment(paymentId: string) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "PENDING") return;
  await prisma.payment.update({ where: { id: paymentId }, data: { status: "REJECTED" } });
  await audit({ userId: user.id, action: "PAYMENT_REJECT", resourceType: "Payment", resourceId: paymentId, before: { status: "PENDING" }, after: { status: "REJECTED" } });
  await logActivity({ type: "PAYMENT_REJECTED", message: `Payment ${payment.reference} rejected`, userId: user.id, clientId: payment.clientId, caseId: payment.caseId });
  revalidatePath(`/app/finance/payments/${paymentId}`);
  revalidatePath("/app/finance/payments");
}

export async function createRefund(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("REFUND_CREATE");
  const parsed = refundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const client = await prisma.client.findUnique({ where: { id: d.clientId } });
  if (!client) return { message: "Selected client does not exist." };
  if (d.paymentId) {
    const original = await prisma.payment.findUnique({ where: { id: d.paymentId }, include: { refunds: true } });
    if (!original) return { message: "Original payment not found." };
    if (original.clientId !== d.clientId) return { message: "Original payment belongs to a different client." };
    const alreadyCommitted = original.refunds
      .filter((r) => !["REJECTED", "CANCELLED"].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const available = Math.round((Number(original.amount) - alreadyCommitted) * 100) / 100;
    if (d.amount > available) {
      return { message: `Refund exceeds the available amount on ${original.reference}: ${original.currency} ${available.toFixed(2)} remaining.` };
    }
  }

  const refundNumber = await nextNumber("REF");
  const installments = splitInstallments(d.amount, d.installments).map((installment, index) => ({
    ...installment,
    number: index + 1,
  }));

  const refund = await prisma.refund.create({
    data: {
      refundNumber,
      clientId: d.clientId,
      caseId: emptyToNull(d.caseId),
      paymentId: emptyToNull(d.paymentId),
      amount: d.amount,
      currency: d.currency.toUpperCase(),
      reason: d.reason,
      createdById: user.id,
      installments: { create: installments },
    },
  });
  await audit({ userId: user.id, action: "REFUND_CREATE", resourceType: "Refund", resourceId: refund.id, after: { refundNumber, amount: d.amount, installments: d.installments } });
  await logActivity({ type: "REFUND_REQUESTED", message: `Refund ${refundNumber} requested (${refund.currency} ${d.amount})`, userId: user.id, clientId: d.clientId, caseId: refund.caseId });
  redirect(`/app/finance/refunds/${refund.id}?toast=${encodeURIComponent("Refund request created")}`);
}

export async function setRefundStatus(refundId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");
  const status = String(formData.get("status") ?? "");
  const allowed = ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"];
  if (!allowed.includes(status)) return;
  const before = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!before) return;
  const refund = await prisma.refund.update({
    where: { id: refundId },
    data: {
      status: status as never,
      ...(status === "APPROVED" ? { approvedById: user.id } : {}),
    },
  });
  await audit({ userId: user.id, action: `REFUND_${status}`, resourceType: "Refund", resourceId: refundId, before: { status: before.status }, after: { status } });
  await logActivity({ type: "REFUND_UPDATED", message: `Refund ${refund.refundNumber} → ${status.replaceAll("_", " ")}`, userId: user.id, clientId: refund.clientId, caseId: refund.caseId });
  if (status === "APPROVED") {
    await prisma.notification.create({
      data: {
        userId: refund.createdById,
        type: "REFUND_APPROVED",
        title: `Refund ${refund.refundNumber} approved`,
      },
    });
  }
  revalidatePath(`/app/finance/refunds/${refundId}`);
}

export async function markInstallmentPaid(installmentId: string) {
  const user = await assertPermission("REFUND_APPROVE");
  const inst = await prisma.refundInstallment.findUnique({ where: { id: installmentId }, include: { refund: { include: { installments: true } } } });
  if (!inst || inst.status === "PAID") return;
  if (!["APPROVED", "PARTIALLY_PAID"].includes(inst.refund.status)) return;
  const paidAt = new Date();
  await assertFinancialPeriodOpen(paidAt);

  await prisma.refundInstallment.update({ where: { id: installmentId }, data: { status: "PAID", paidAt } });
  const remaining = inst.refund.installments.filter((i) => i.id !== installmentId && i.status !== "PAID" && i.status !== "CANCELLED").length;
  const newStatus = remaining === 0 ? "PAID" : "PARTIALLY_PAID";
  await prisma.refund.update({ where: { id: inst.refundId }, data: { status: newStatus } });
  await audit({ userId: user.id, action: "REFUND_INSTALLMENT_PAID", resourceType: "RefundInstallment", resourceId: installmentId, after: { refund: inst.refund.refundNumber, newStatus } });
  await logActivity({ type: "REFUND_UPDATED", message: `Installment paid on ${inst.refund.refundNumber} (${newStatus.replaceAll("_", " ")})`, userId: user.id, clientId: inst.refund.clientId, caseId: inst.refund.caseId });
  revalidatePath(`/app/finance/refunds/${inst.refundId}`);
}
