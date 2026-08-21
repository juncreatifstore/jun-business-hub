"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ensureReceiptMeta, voidReceiptMeta } from "@/lib/finance-receipts";

export async function voidReceipt(paymentId: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const reason = String(formData.get("reason") || "").trim().slice(0, 1000);
  if (!reason) redirect(`/app/finance/receipts/${paymentId}?toast_error=${encodeURIComponent("A void reason is required")}`);

  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, reference: true, status: true, paidAt: true, createdAt: true, clientId: true, caseId: true } });
  if (!payment || !payment.paidAt) redirect(`/app/finance/receipts?toast_error=${encodeURIComponent("Receipt not found")}`);

  const meta = await ensureReceiptMeta(payment);
  if (meta.status === "VOID") redirect(`/app/finance/receipts/${paymentId}?toast=${encodeURIComponent("Receipt is already void")}`);
  const next = await voidReceiptMeta(paymentId, user.id, reason);
  await audit({ userId: user.id, action: "RECEIPT_VOID", resourceType: "Payment", resourceId: paymentId, before: { receiptStatus: meta.status }, after: { receiptStatus: next?.status, reason } });
  await logActivity({ type: "PAYMENT_UPDATED", message: `Receipt RCT-${payment.reference} voided`, userId: user.id, clientId: payment.clientId, caseId: payment.caseId });
  revalidatePath(`/app/finance/receipts/${paymentId}`);
  revalidatePath("/app/finance/receipts");
  revalidatePath(`/verify/RCT-${payment.reference}`);
  redirect(`/app/finance/receipts/${paymentId}?toast=${encodeURIComponent("Receipt voided")}`);
}
