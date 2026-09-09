"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { getClientAvailableBalance } from "@/lib/client-financial-account";
import { savePaymentCoreMeta } from "@/lib/finance-payment-core";
import { saveRefundInstallmentMeta } from "@/lib/finance-refund-installments";
import { saveRefundWorkflowMeta } from "@/lib/finance-refund-workflow";
import { ensureUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";
import type { PaymentMethod } from "@prisma/client";

export type HistoricalBackfillState = { message?: string };

type PaymentRow = {
  date: string;
  amount: string | number;
  currency: string;
  method: string;
  transactionRef?: string;
  purpose?: string;
  notes?: string;
};

type RefundRow = {
  date: string;
  amount: string | number;
  currency: string;
  method: string;
  transactionRef?: string;
  reason?: string;
  notes?: string;
};

type ParsedPayment = {
  date: Date;
  amount: number;
  currency: string;
  method: PaymentMethod;
  transactionRef: string | null;
  purpose: string | null;
  notes: string | null;
};

type ParsedRefund = {
  date: Date;
  amount: number;
  currency: string;
  method: string;
  transactionRef: string | null;
  reason: string;
  notes: string | null;
};

const METHODS = new Set<PaymentMethod>(["ZELLE", "STRIPE", "PAYPAL", "MERCADO_PAGO", "BANK_TRANSFER", "CASH", "MONCASH", "OTHER"]);
const BATCH_PREFIX = "finance.historical.backfill.batch.";
const MAX_ROWS = 50;

function clean(value: unknown, max = 2000) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

function parseHistoricalDate(raw: unknown): Date | null {
  const value = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  if (date.getTime() >= tomorrow.getTime()) return null;
  return date;
}

function parseMoney(raw: unknown): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function parseCurrency(raw: unknown): string | null {
  const currency = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function parseJsonRows<T>(raw: FormDataEntryValue | null): T[] | null {
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as T[] : null;
  } catch {
    return null;
  }
}

function parsePayments(rows: PaymentRow[]): { rows?: ParsedPayment[]; error?: string } {
  if (rows.length > MAX_ROWS) return { error: `A maximum of ${MAX_ROWS} historical payments can be imported at once.` };
  const out: ParsedPayment[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const hasAny = [row.date, row.amount, row.transactionRef, row.purpose, row.notes].some((value) => String(value ?? "").trim());
    if (!hasAny) continue;
    const date = parseHistoricalDate(row.date);
    const amount = parseMoney(row.amount);
    const currency = parseCurrency(row.currency);
    const method = String(row.method ?? "").trim().toUpperCase() as PaymentMethod;
    if (!date) return { error: `Payment row ${index + 1}: enter a valid historical date.` };
    if (amount == null) return { error: `Payment row ${index + 1}: enter a valid positive amount.` };
    if (!currency) return { error: `Payment row ${index + 1}: currency must be a 3-letter code.` };
    if (!METHODS.has(method)) return { error: `Payment row ${index + 1}: invalid payment method.` };
    out.push({
      date,
      amount,
      currency,
      method,
      transactionRef: clean(row.transactionRef, 160),
      purpose: clean(row.purpose, 160),
      notes: clean(row.notes, 2000),
    });
  }
  return { rows: out };
}

function parseRefunds(rows: RefundRow[]): { rows?: ParsedRefund[]; error?: string } {
  if (rows.length > MAX_ROWS) return { error: `A maximum of ${MAX_ROWS} historical refunds can be imported at once.` };
  const out: ParsedRefund[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const hasAny = [row.date, row.amount, row.transactionRef, row.reason, row.notes].some((value) => String(value ?? "").trim());
    if (!hasAny) continue;
    const date = parseHistoricalDate(row.date);
    const amount = parseMoney(row.amount);
    const currency = parseCurrency(row.currency);
    const method = String(row.method ?? "").trim().toUpperCase();
    const reason = clean(row.reason, 2000);
    if (!date) return { error: `Refund row ${index + 1}: enter a valid historical date.` };
    if (amount == null) return { error: `Refund row ${index + 1}: enter a valid positive amount.` };
    if (!currency) return { error: `Refund row ${index + 1}: currency must be a 3-letter code.` };
    if (!method) return { error: `Refund row ${index + 1}: payment method is required.` };
    if (!reason) return { error: `Refund row ${index + 1}: reason is required.` };
    out.push({
      date,
      amount,
      currency,
      method: method.slice(0, 80),
      transactionRef: clean(row.transactionRef, 180),
      reason,
      notes: clean(row.notes, 2000),
    });
  }
  return { rows: out };
}

function sumByCurrency<T extends { currency: string; amount: number }>(rows: T[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.currency, Math.round(((totals.get(row.currency) ?? 0) + row.amount) * 100) / 100);
  return totals;
}

export async function importHistoricalFinancialBatch(_prev: HistoricalBackfillState, formData: FormData): Promise<HistoricalBackfillState> {
  const user = await assertPermission("PAYMENT_APPROVE");
  await assertPermission("REFUND_APPROVE");

  const clientId = String(formData.get("clientId") ?? "").trim();
  const caseIdRaw = String(formData.get("caseId") ?? "").trim();
  const caseId = caseIdRaw || null;
  const batchId = String(formData.get("batchId") ?? "").trim();
  const confirmed = String(formData.get("confirmHistorical") ?? "") === "yes";
  if (!clientId) return { message: "Select a client." };
  if (!/^[a-zA-Z0-9-]{12,80}$/.test(batchId)) return { message: "Historical batch identifier is invalid. Reload the page and try again." };
  if (!confirmed) return { message: "Confirm that these transactions already occurred and are being entered late." };

  const [client, existingBatch] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.appSetting.findUnique({ where: { key: `${BATCH_PREFIX}${batchId}` }, select: { value: true } }),
  ]);
  if (!client) return { message: "Selected client does not exist." };
  if (existingBatch) {
    redirect(`/app/clients/${clientId}/account?toast=${encodeURIComponent("This historical batch was already recorded. No duplicate transactions were created.")}`);
  }

  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true } });
    if (!linkedCase) return { message: "Selected case does not exist." };
    if (linkedCase.clientId !== clientId) return { message: "Selected case belongs to a different client." };
  }

  const paymentJson = parseJsonRows<PaymentRow>(formData.get("paymentsJson"));
  const refundJson = parseJsonRows<RefundRow>(formData.get("refundsJson"));
  if (!paymentJson || !refundJson) return { message: "Historical transaction data could not be read. Reload the page and try again." };

  const parsedPayments = parsePayments(paymentJson);
  if (parsedPayments.error) return { message: parsedPayments.error };
  const parsedRefunds = parseRefunds(refundJson);
  if (parsedRefunds.error) return { message: parsedRefunds.error };
  const payments = parsedPayments.rows ?? [];
  const refunds = parsedRefunds.rows ?? [];
  if (!payments.length && !refunds.length) return { message: "Add at least one historical payment or refund." };

  const refs = payments.map((row) => row.transactionRef).filter((value): value is string => Boolean(value));
  if (new Set(refs.map((value) => value.toLowerCase())).size !== refs.length) return { message: "The same payment transaction reference appears more than once in this batch." };
  if (refs.length) {
    const duplicates = await prisma.payment.findMany({ where: { clientId, providerRef: { in: refs } }, select: { reference: true, providerRef: true } });
    if (duplicates.length) return { message: `A payment with transaction reference ${duplicates[0].providerRef} already exists (${duplicates[0].reference}).` };
  }

  const paymentTotals = sumByCurrency(payments);
  const refundTotals = sumByCurrency(refunds);
  for (const [currency, refundTotal] of refundTotals) {
    const currentAvailable = await getClientAvailableBalance(clientId, currency);
    const incoming = paymentTotals.get(currency) ?? 0;
    if (refundTotal > currentAvailable + incoming + 0.005) {
      return { message: `Historical refunds exceed available ${currency} funds after this batch: ${currency} ${(currentAvailable + incoming).toFixed(2)} available versus ${currency} ${refundTotal.toFixed(2)} refunded.` };
    }
  }

  const paymentNumbers: string[] = [];
  for (let i = 0; i < payments.length; i += 1) paymentNumbers.push(await nextNumber("PAY"));
  const refundNumbers: string[] = [];
  for (let i = 0; i < refunds.length; i += 1) refundNumbers.push(await nextNumber("REF"));

  const batchRecordedAt = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const createdPayments: Array<{ id: string; reference: string; row: ParsedPayment }> = [];
    const createdRefunds: Array<{ id: string; refundNumber: string; installmentId: string; row: ParsedRefund }> = [];

    for (let i = 0; i < payments.length; i += 1) {
      const row = payments[i];
      const payment = await tx.payment.create({
        data: {
          reference: paymentNumbers[i],
          clientId,
          caseId,
          amount: row.amount,
          currency: row.currency,
          method: row.method,
          status: "CONFIRMED",
          provider: "HISTORICAL_BACKFILL",
          providerRef: row.transactionRef,
          notes: [`Historical late entry · batch ${batchId}`, row.purpose ? `Purpose: ${row.purpose}` : "", row.notes ?? ""].filter(Boolean).join(" · ").slice(0, 2000),
          recordedById: user.id,
          paidAt: row.date,
        },
        select: { id: true, reference: true },
      });
      createdPayments.push({ ...payment, row });
    }

    for (let i = 0; i < refunds.length; i += 1) {
      const row = refunds[i];
      const refund = await tx.refund.create({
        data: {
          refundNumber: refundNumbers[i],
          clientId,
          caseId,
          amount: row.amount,
          currency: row.currency,
          reason: row.reason,
          status: "PAID",
          createdById: user.id,
          approvedById: user.id,
          installments: {
            create: {
              number: 1,
              amount: row.amount,
              dueDate: row.date,
              paidAt: row.date,
              status: "PAID",
            },
          },
        },
        include: { installments: { select: { id: true } } },
      });
      createdRefunds.push({ id: refund.id, refundNumber: refund.refundNumber, installmentId: refund.installments[0].id, row });
    }

    await tx.appSetting.create({
      data: {
        key: `${BATCH_PREFIX}${batchId}`,
        value: JSON.stringify({
          batchId,
          clientId,
          caseId,
          paymentIds: createdPayments.map((row) => row.id),
          refundIds: createdRefunds.map((row) => row.id),
          recordedAt: batchRecordedAt.toISOString(),
          recordedById: user.id,
        }),
      },
    });

    return { createdPayments, createdRefunds };
  });

  await Promise.all(created.createdPayments.map(async ({ id, reference, row }) => {
    await savePaymentCoreMeta(id, {
      expectedAmount: null,
      serviceLabel: row.purpose,
      providerRef: row.transactionRef,
      accountId: null,
      accountLabel: "Historical backfill",
      accountDescriptor: null,
      accountMethod: row.method,
      accountCurrency: row.currency,
      feeAmount: 0,
    }).catch(() => undefined);
    await ensureUniversalFinancialReceipt({
      sourceType: "PAYMENT",
      sourceId: id,
      clientId,
      amount: row.amount,
      currency: row.currency,
      direction: "CREDIT",
      title: "Historical payment receipt",
      description: row.purpose || row.notes || "Historical payment entered after the original transaction date",
      status: "CONFIRMED",
      method: row.method,
      transactionReference: row.transactionRef || reference,
      issuedById: user.id,
    }).catch(() => undefined);
  }));

  await Promise.all(created.createdRefunds.map(async ({ id, refundNumber, installmentId, row }) => {
    await saveRefundInstallmentMeta(installmentId, {
      method: row.method,
      transactionRef: row.transactionRef,
      notes: ["Historical late entry", row.notes ?? ""].filter(Boolean).join(" · "),
    }).catch(() => undefined);
    await saveRefundWorkflowMeta(id, {
      refundType: "UNLINKED",
      decisionReason: "Historical transaction backfill: refund had already been completed before system entry.",
      reviewedAt: batchRecordedAt.toISOString(),
      reviewedById: user.id,
      decidedAt: batchRecordedAt.toISOString(),
      decidedById: user.id,
    }).catch(() => undefined);
    await ensureUniversalFinancialReceipt({
      sourceType: "REFUND",
      sourceId: id,
      clientId,
      amount: row.amount,
      currency: row.currency,
      direction: "DEBIT",
      title: "Historical refund receipt",
      description: row.reason,
      status: "PAID",
      method: row.method,
      transactionReference: row.transactionRef || refundNumber,
      issuedById: user.id,
    }).catch(() => undefined);
  }));

  await audit({
    userId: user.id,
    action: "HISTORICAL_FINANCIAL_BACKFILL",
    resourceType: "Client",
    resourceId: clientId,
    after: {
      batchId,
      caseId,
      payments: created.createdPayments.map((row) => ({ reference: row.reference, amount: row.row.amount, currency: row.row.currency, paidAt: row.row.date.toISOString() })),
      refunds: created.createdRefunds.map((row) => ({ reference: row.refundNumber, amount: row.row.amount, currency: row.row.currency, paidAt: row.row.date.toISOString() })),
      note: "Late historical entry deliberately bypassed the normal pending/approval timeline because the transactions had already occurred.",
    },
  });
  await logActivity({
    type: "FINANCE_HISTORICAL_BACKFILL",
    message: `Historical finance batch recorded: ${payments.length} confirmed payment(s), ${refunds.length} paid refund(s).`,
    userId: user.id,
    clientId,
    caseId,
  });

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/account`);
  revalidatePath(`/app/clients/${clientId}/statement`);
  revalidatePath("/app/finance/payments");
  revalidatePath("/app/finance/refunds");
  revalidatePath("/app/finance/historical-backfill");

  redirect(`/app/clients/${clientId}/account?toast=${encodeURIComponent(`Historical batch recorded: ${payments.length} payment(s) confirmed and ${refunds.length} refund(s) marked paid.`)}`);
}
