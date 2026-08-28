"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { findAuthorizationForResource } from "@/lib/company-funds-approvals";
import { createFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";
import type { RefundStatus } from "@prisma/client";

function round(value:number){return Math.round((Number(value||0)+Number.EPSILON)*100)/100}

export async function confirmLegacyRefundFullyPaid(refundId: string, formData: FormData) {
  const user = await assertPermission("REFUND_APPROVE");

  // Completed retries return before any authorization or closed-period check.
  const initial = await prisma.refund.findUnique({ where: { id: refundId }, include: { installments: true } });
  if (!initial) throw new Error("Refund not found.");
  if (initial.status === "PAID") return;

  const method = String(formData.get("method") || "").trim().slice(0, 80);
  const transactionRef = String(formData.get("transactionRef") || "").trim().slice(0, 180);
  const proofFileId = String(formData.get("proofFileId") || "").trim();
  const notes = String(formData.get("notes") || "").trim().slice(0, 2000) || null;
  if (!method || !transactionRef || !proofFileId) throw new Error("Method, transaction reference and proof are required.");
  if (initial.status !== "APPROVED") throw new Error("Only an approved refund can be confirmed as fully paid.");
  if (initial.installments.length > 0) throw new Error("This refund already has an installment schedule. Use the installment payout workflow instead.");

  const proof = await prisma.file.findFirst({
    where: { id: proofFileId, refundId, clientId: initial.clientId, archivedAt: null },
    select: { id: true },
  });
  if (!proof) throw new Error("Select a valid proof already attached to this refund.");

  const authorization = await findAuthorizationForResource("REFUND", `legacy:${refundId}`);
  if (!authorization || authorization.status !== "APPROVED") throw new Error("Approved financial authorization is required before legacy refund payout.");
  if (authorization.currency !== initial.currency.toUpperCase() || Math.abs(authorization.amount - Number(initial.amount)) > 0.005) {
    throw new Error("Financial authorization no longer matches this refund.");
  }

  const paidAt = new Date();
  await assertFinancialPeriodOpen(paidAt);
  const paidAtIso = paidAt.toISOString();

  // Evidence is idempotent by authorization. If the state transaction is interrupted,
  // the next retry reuses this same evidence instead of creating another execution.
  await createFinancialExecutionEvidence({
    authorizationId: authorization.id,
    transactionReference: transactionRef,
    proofFileId: proof.id,
    note: `${method}${notes ? ` · ${notes}` : ""}`,
    executedById: user.id,
    executedAt: paidAtIso,
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`legacy-refund:${refundId}`}))`;
    const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { installments: true } });
    if (!refund) throw new Error("Refund not found.");
    if (refund.status === "PAID") return { duplicate: true, refund, installment: refund.installments[0] ?? null };
    if (refund.status !== "APPROVED") throw new Error("Refund is no longer payable.");
    if (refund.installments.length > 0) throw new Error("This refund now has an installment schedule. Refresh and use the installment payout workflow.");

    const installment = await tx.refundInstallment.create({
      data: { refundId, number: 1, amount: refund.amount, dueDate: paidAt, paidAt, status: "PAID" },
    });
    const metaValue = JSON.stringify({
      method,
      transactionRef,
      notes,
      proofFileId: proof.id,
      reminderCount: 0,
      lastReminderAt: null,
      updatedAt: paidAtIso,
    });
    await tx.appSetting.upsert({
      where: { key: `finance.refund.installment.${installment.id}` },
      create: { key: `finance.refund.installment.${installment.id}`, value: metaValue },
      update: { value: metaValue },
    });
    await tx.refund.update({ where: { id: refundId }, data: { status: "PAID" } });

    if (refund.paymentId) {
      const payment = await tx.payment.findUnique({ where: { id: refund.paymentId }, include: { refunds: { include: { installments: true } } } });
      if (payment) {
        let paidTotal = 0;
        for (const linkedRefund of payment.refunds) {
          for (const linkedInstallment of linkedRefund.installments) {
            if (linkedInstallment.status === "PAID") paidTotal += Number(linkedInstallment.amount);
          }
          if (linkedRefund.id === refundId) paidTotal += Number(refund.amount);
        }
        const total = round(paidTotal);
        if (total > 0) {
          const paymentStatus: "PARTIALLY_REFUNDED" | "REFUNDED" = total >= Number(payment.amount) - 0.005 ? "REFUNDED" : "PARTIALLY_REFUNDED";
          if (payment.status !== paymentStatus) await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
        }
      }
    }

    return { duplicate: false, refund: { ...refund, status: "PAID" as RefundStatus }, installment };
  }, { isolationLevel: "Serializable" });

  if (!created.duplicate && created.installment) {
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
        proofFileId: proof.id,
        installmentId: created.installment.id,
        authorizationId: authorization.id,
        paidAt: paidAtIso,
      },
    });
    await logActivity({
      type: "REFUND_UPDATED",
      message: `Refund ${created.refund.refundNumber} confirmed fully paid (${created.refund.currency} ${Number(created.refund.amount).toFixed(2)})`,
      userId: user.id,
      clientId: created.refund.clientId,
      caseId: created.refund.caseId,
    });
  }

  revalidatePath(`/app/finance/refunds/${refundId}`);
  revalidatePath("/app/finance/refunds");
  revalidatePath("/app/finance/payments");
  revalidatePath(`/app/clients/${created.refund.clientId}`);
  revalidatePath(`/app/clients/${created.refund.clientId}/finance`);
  revalidatePath(`/app/clients/${created.refund.clientId}/account`);
  revalidatePath(`/app/clients/${created.refund.clientId}/statement`);
  if (created.refund.paymentId) revalidatePath(`/app/finance/payments/${created.refund.paymentId}`);
  revalidatePath("/app/company-funds/authorizations");
  revalidatePath("/app/company-funds/execution-evidence");
  revalidatePath("/app/company-funds/timeline");
}
