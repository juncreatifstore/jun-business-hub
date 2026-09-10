"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission, requestMeta } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { refundPlanSnapshot, validateRefundPlan, type PlanRow } from "@/lib/refund-payment-plan";
import { invalidateCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue-cache";
import { markRefundInstallmentPaidAuthorized } from "@/services/refund-financial-authorization";

export async function confirmPlannedRefundPayment(
  installmentId: string,
  _state: { message: string; success: boolean },
): Promise<{ message: string; success: boolean }> {
  try {
    await markRefundInstallmentPaidAuthorized(installmentId);
    return {
      success: true,
      message: "Versement enregistré. Le montant payé et le solde ont été actualisés.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Impossible de confirmer ce versement.",
    };
  }
}

export async function saveRefundPaymentPlan(
  refundId: string,
  _state: { message?: string; success?: boolean },
  data: FormData,
): Promise<{ message: string; success: boolean }> {
  const user = await assertPermission("REFUND_APPROVE");
  try {
    const raw = String(data.get("rows") || "");
    if (raw.length > 10000) throw new Error("Échéancier trop volumineux.");
    const rows = JSON.parse(raw) as PlanRow[];
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row.amount !== "string" || typeof row.dueDate !== "string")
    )
      throw new Error("Échéancier invalide.");
    const expected = String(data.get("snapshot") || "");
    const requestId = String(data.get("requestId") || "");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new Error("Rechargez la fiche puis réessayez.");
    const meta = requestMeta();
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund-plan:${refundId}`}))`;
        const marker = `refund.plan.request.${refundId}.${requestId}`;
        if (await tx.appSetting.findUnique({ where: { key: marker } })) return null;
        const refund = await tx.refund.findUnique({
          where: { id: refundId },
          include: { installments: true },
        });
        if (!refund || !["APPROVED", "PARTIALLY_PAID"].includes(refund.status))
          throw new Error("Le remboursement doit être approuvé et non clôturé.");
        if (refundPlanSnapshot(refund.installments) !== expected)
          throw new Error("L’échéancier a changé. Rechargez la fiche avant de recommencer.");
        const paid = refund.installments
          .filter((i) => i.status === "PAID")
          .reduce((sum, i) => sum + Math.round(Number(i.amount) * 100), 0);
        const remaining = Math.round(Number(refund.amount) * 100) - paid;
        const plan = validateRefundPlan(rows, remaining);
        const open = refund.installments
          .filter((i) => !["PAID", "CANCELLED"].includes(i.status))
          .sort((a, b) => a.id.localeCompare(b.id));
        const resourceIds = new Set([`legacy:${refundId}`, ...open.map((i) => `installment:${i.id}`)]);
        for (const i of open)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund-installment:${i.id}`}))`;
        for (const id of [...resourceIds].sort())
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial-authorization:REFUND:${id}`}))`;
        const authorizations = await tx.appSetting.findMany({
          where: { key: { startsWith: "company.funds.authorization." } },
          select: { value: true },
        });
        if (
          authorizations.some((row) => {
            const a = JSON.parse(row.value);
            return (
              a.type === "REFUND" &&
              resourceIds.has(a.resourceId) &&
              ["PENDING", "APPROVED"].includes(a.status)
            );
          })
        )
          throw new Error(
            "Une autorisation financière est déjà en cours pour cet échéancier. Faites-la annuler avant de modifier les tranches.",
          );
        const details = await tx.appSetting.findMany({
          where: { key: { in: open.map((i) => `finance.refund.installment.${i.id}`) } },
          select: { value: true },
        });
        if (
          details.some((row) => {
            const m = JSON.parse(row.value);
            return m.method || m.transactionRef || m.proofFileId;
          })
        )
          throw new Error(
            "Une tranche contient déjà des informations de paiement. Finalisez-la avant de réorganiser le solde.",
          );
        // Preserve paid rows and cancelled schedule history. New rows get new IDs,
        // so old forms and authorizations can never settle a replacement tranche.
        await tx.refundInstallment.updateMany({
          where: { id: { in: open.map((i) => i.id) }, status: { in: ["SCHEDULED", "LATE"] } },
          data: { status: "CANCELLED" },
        });
        const lastNumber = Math.max(0, ...refund.installments.map((i) => i.number));
        await tx.refundInstallment.createMany({
          data: plan.map((row, index) => ({
            refundId,
            number: lastNumber + index + 1,
            amount: row.amount,
            dueDate: row.dueDate,
            status: "SCHEDULED",
          })),
        });
        await tx.appSetting.create({
          data: {
            key: marker,
            value: JSON.stringify({ userId: user.id, createdAt: new Date().toISOString() }),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "REFUND_PAYMENT_PLAN_UPDATED",
            resourceType: "Refund",
            resourceId: refundId,
            before: {
              installments: open.map((i) => ({
                id: i.id,
                amount: String(i.amount),
                dueDate: i.dueDate.toISOString(),
              })),
            },
            after: {
              rows: plan.map((row) => ({ amount: row.amount, dueDate: row.dueDate.toISOString() })),
              paid: paid / 100,
              remaining: remaining / 100,
            },
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
        });
        return refund;
      },
      { isolationLevel: "Serializable" },
    );
    revalidatePath(`/app/finance/refunds/${refundId}`);
    revalidatePath("/app/finance/refunds");
    if (result) {
      revalidatePath(`/app/clients/${result.clientId}/account`);
      revalidatePath(`/app/clients/${result.clientId}/statement`);
    }
    invalidateCompanyFundsWorkQueue();
    return {
      success: true,
      message:
        "Échéancier enregistré. Complétez la méthode, la référence et la preuve de chaque versement, puis confirmez son paiement.",
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Impossible d’enregistrer l’échéancier.",
    };
  }
}
