"use server";

import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { getFinancePaymentAccount, calculatePaymentFee } from "@/lib/finance-payment-accounts";
import { savePaymentCoreMeta } from "@/lib/finance-payment-core";
import { getClientBlock } from "@/lib/client-transaction-block";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { emptyToNull, parseDate, paymentSchema } from "@/lib/validation";
import type { FormState } from "@/services/clients";

export async function createPaymentWithAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await assertPermission("PAYMENT_CREATE");
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const [client, account, block] = await Promise.all([
    prisma.client.findUnique({ where: { id: d.clientId }, select: { id: true } }),
    d.accountId ? getFinancePaymentAccount(d.accountId) : Promise.resolve(null),
    getClientBlock(d.clientId),
  ]);
  if (!client) return { message: "Selected client does not exist." };
  if (block?.blocked) {
    await audit({ userId: user.id, action: "PAYMENT_CREATE_BLOCKED_CLIENT", resourceType: "Client", resourceId: d.clientId, after: { reason: block.reason } });
    return { message: `Payment blocked: JUN ended the commercial relationship with this client. Reason: ${block.reason}` };
  }

  const caseId = emptyToNull(d.caseId);
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
    if (!linkedCase) return { message: "Selected case does not exist." };
    if (linkedCase.clientId !== d.clientId) return { message: "Selected case belongs to a different client." };
  }

  if (d.accountId && !account) return { message: "Selected receiving account no longer exists." };
  if (account && !account.enabled) return { message: "Selected receiving account is disabled." };
  if (account && account.method !== d.method) return { message: `Payment method must match the selected account (${account.method.replaceAll("_", " ")}).` };
  if (account && account.currency !== d.currency.toUpperCase()) return { message: `Payment currency must match the selected account (${account.currency}).` };

  const currency = d.currency.toUpperCase();
  const providerRef = emptyToNull(d.providerRef);
  const paidAt = parseDate(d.paidAt) ?? new Date();

  // Provider references are our strongest retry/idempotency key. Check them
  // before the historical-period lock so a retry of an already-recorded
  // payment remains harmless even if that period has since been closed.
  if (providerRef) {
    const existing = await prisma.payment.findFirst({
      where: { clientId: d.clientId, providerRef },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      const samePayment = Number(existing.amount) === Number(d.amount) && existing.currency === currency && existing.method === d.method;
      if (!samePayment) return { message: `Provider reference ${providerRef} is already attached to payment ${existing.reference} with different payment details.` };
      redirect(`/app/finance/payments/${existing.id}?toast=${encodeURIComponent("Payment already recorded — existing transaction reopened")}`);
    }
  }

  try {
    await assertFinancialPeriodOpen(paidAt);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Financial period is closed." };
  }

  const reference = await nextNumber("PAY");
  const feeAmount = calculatePaymentFee(d.amount, account);
  const payment = await prisma.payment.create({
    data: {
      reference,
      clientId: d.clientId,
      caseId,
      amount: d.amount,
      currency,
      method: d.method,
      provider: account?.label || null,
      providerRef,
      paidAt,
      notes: emptyToNull(d.notes),
      recordedById: user.id,
    },
  });
  const expectedAmount = d.expectedAmount === "" || d.expectedAmount == null ? null : Number(d.expectedAmount);
  await savePaymentCoreMeta(payment.id, { expectedAmount, serviceLabel: emptyToNull(d.serviceLabel), providerRef, accountId: account?.id || null, accountLabel: account?.label || null, accountDescriptor: account?.accountDescriptor || null, accountMethod: account?.method || null, accountCurrency: account?.currency || null, feeAmount });
  await audit({ userId: user.id, action: "PAYMENT_CREATE", resourceType: "Payment", resourceId: payment.id, after: { reference, amount: d.amount, expectedAmount, currency: payment.currency, method: payment.method, providerRef: payment.providerRef, serviceLabel: emptyToNull(d.serviceLabel), accountId: account?.id || null, accountLabel: account?.label || null, feeAmount, paidAt: payment.paidAt } });
  await logActivity({ type: "PAYMENT_CREATED", message: `Payment ${reference} recorded (${payment.currency} ${d.amount})${account ? ` to ${account.label}` : ""}`, userId: user.id, clientId: d.clientId, caseId: payment.caseId });
  redirect(`/app/finance/payments/${payment.id}?toast=${encodeURIComponent("Payment recorded — pending confirmation")}`);
}
