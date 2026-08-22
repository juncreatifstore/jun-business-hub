"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { saveRefundInstallmentMeta } from "@/lib/finance-refund-installments";

async function recomputeLinkedPaymentRefundStatus(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: { include: { installments: true } } },
  });
  if (!payment) return;
  const paidTotal = payment.refunds.reduce((sum, refund) => {
    return sum + refund.installments
      .filter((i) => i.status === "PAID")
      .reduce((s, i) => s + Number(i.amount), 0);
  }, 0);
  const rounded = Math.round(paidTotal * 100) / 100;
  if (rounded <= 0) return;
  const amount = Number(payment.amount);
  const status = rounded >= amount - 0.005 ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (payment.status !== status) {
    await prisma.payment.update({ where: { id: paymentId }, data: { status } });
  }
}

export async function confirmLegacyRefundFullyPaid(refundId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");
  const method = String(formData.get("method") || "").trim().slice(0, 80);
  const transactionRef = String(formData.get("transactionRef") || "").trim().slice(0, 180);
  const proofFileId = String(formData.get("proofFileId") || "").trim();
  const notes = String(formData.get("notes") || "").trim().slice(0, 2000) || null;
  if (!method || !transactionRef || !proofFileId) return;

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${refundId}))`;
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { installments: true },
    });
    if (!refund) throw new Error("Refund not found.");
    if (refund.status !== "APPROVED") throw new Error("Only an approved refund can be confirmed as fully paid.");
    if (refund.installments.length > 0) throw new Error("This refund already has an installment schedule. Use the installment payout workflow instead.");

    const proof = await tx.file.findFirst({
      where: {
        id: proofFileId,
        refundId,
        clientId: refund.clientId,
        archivedAt: null,
      },
      select: { id: true, name: true },
    });
    if (!proof) throw new Error("Select a valid proof already attached to this refund.");

    const now = new Date();
    const installment = await tx.refundInstallment.create({
      data: {
        refundId,
        number: 1,
        amount: refund.amount,
        dueDate: now,
        paidAt: now,
        status: "PAID",
      },
    });
    await tx.refund.update({ where: { id: refundId }, data: { status: "PAID" } });
    return { refund, installment, proof };
  });

  await saveRefundInstallmentMeta(created.installment.id, {
    method,
    transactionRef,
    proofFileId,
    notes,
  });

  if (created.refund.paymentId) await recomputeLinkedPaymentRefundStatus(created.refund.paymentId);

  await audit({
    userId: user.id,
    action: "REFUND_LEGACY_FULLY_PAID",
    resourceType: "Refund",
    resourceId: refundId,
    after: {
      amount: Number(created.refund.amount),
      currency: created.refund.currency,
      method,
      transactionRef,
      proofFileId,
      installmentId: created.installment.id,
    },
  });
  await logActivity({
    type: "REFUND_UPDATED",
    message: `Refund ${created.refund.refundNumber} confirmed fully paid (${created.refund.currency} ${Number(created.refund.amount).toFixed(2)})`,
    userId: user.id,
    clientId: created.refund.clientId,
    caseId: created.refund.caseId,
  });

  revalidatePath(`/app/finance/refunds/${refundId}`);
  revalidatePath("/app/finance/refunds");
  revalidatePath(`/app/clients/${created.refund.clientId}`);
  revalidatePath(`/app/clients/${created.refund.clientId}/finance`);
  revalidatePath(`/app/clients/${created.refund.clientId}/account`);
  revalidatePath(`/app/clients/${created.refund.clientId}/statement`);
}
