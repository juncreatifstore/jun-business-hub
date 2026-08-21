"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getPaymentCoreMeta, savePaymentCoreMeta } from "@/lib/finance-payment-core";
import { prisma } from "@/lib/prisma";

export async function correctPaymentFee(id: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const payment = await prisma.payment.findUnique({ where: { id }, select: { id: true, reference: true, amount: true, currency: true, clientId: true } });
  if (!payment) redirect("/app/finance/payments");

  const raw = String(formData.get("feeAmount") ?? "").trim();
  const reason = String(formData.get("feeCorrectionReason") || "").trim().slice(0, 1000);
  const feeAmount = raw === "" ? 0 : Number(raw);
  const gross = Number(payment.amount);
  const path = `/app/finance/payments/${id}/edit`;

  if (!Number.isFinite(feeAmount) || feeAmount < 0) redirect(`${path}?toast_error=${encodeURIComponent("Fee must be zero or a positive amount")}`);
  if (feeAmount > gross) redirect(`${path}?toast_error=${encodeURIComponent("Fee cannot exceed the gross payment amount")}`);
  if (!reason) redirect(`${path}?toast_error=${encodeURIComponent("Correction reason is required")}`);

  const meta = await getPaymentCoreMeta(id);
  await savePaymentCoreMeta(id, { ...meta, feeAmount: Math.round(feeAmount * 100) / 100 });

  await audit({
    userId: user.id,
    action: "PAYMENT_FEE_CORRECTION",
    resourceType: "Payment",
    resourceId: id,
    before: { feeAmount: meta.feeAmount ?? 0, grossAmount: gross, currency: payment.currency },
    after: {
      feeAmount: Math.round(feeAmount * 100) / 100,
      grossAmount: gross,
      netAmount: Math.round((gross - feeAmount) * 100) / 100,
      currency: payment.currency,
      correctionReason: reason,
    },
  });

  revalidatePath(`/app/finance/payments/${id}`);
  revalidatePath(`/app/finance/payments/${id}/edit`);
  revalidatePath(`/app/clients/${payment.clientId}`);
  revalidatePath(`/app/clients/${payment.clientId}/account`);
  revalidatePath(`/app/clients/${payment.clientId}/statement`);
  redirect(`/app/finance/payments/${id}?toast=${encodeURIComponent("Transfer fee corrected")}`);
}
