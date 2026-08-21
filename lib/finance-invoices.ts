import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const INVOICE_PREFIX = "finance.invoice.";

export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";
export type InvoiceLine = { id: string; description: string; quantity: number; unitPrice: number; taxRate: number; lineTotal: number };
export type InvoicePaymentLink = { paymentId: string; linkedAt: string; linkedById: string; amountApplied: number };
export type InvoiceReminder = { sentAt: string; sentById: string; channel: "EMAIL" | "WHATSAPP" | "MANUAL"; note: string };
export type FinanceInvoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  caseId: string | null;
  currency: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  title: string;
  notes: string;
  terms: string;
  lines: InvoiceLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  payments: InvoicePaymentLink[];
  reminders: InvoiceReminder[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

function round(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
export function invoiceKey(id: string) { return `${INVOICE_PREFIX}${id}`; }

export function calculateInvoiceLines(lines: Array<Pick<InvoiceLine, "description" | "quantity" | "unitPrice" | "taxRate"> & { id?: string }>) {
  const normalized: InvoiceLine[] = lines
    .filter((l) => l.description.trim() && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0)
    .map((l) => {
      const quantity = round(Number(l.quantity));
      const unitPrice = round(Number(l.unitPrice));
      const taxRate = Math.max(0, round(Number(l.taxRate || 0)));
      const base = round(quantity * unitPrice);
      const tax = round(base * taxRate / 100);
      return { id: l.id || randomUUID(), description: l.description.trim().slice(0, 240), quantity, unitPrice, taxRate, lineTotal: round(base + tax) };
    });
  const subtotal = round(normalized.reduce((s, l) => s + round(l.quantity * l.unitPrice), 0));
  const taxTotal = round(normalized.reduce((s, l) => s + round(l.quantity * l.unitPrice * l.taxRate / 100), 0));
  return { lines: normalized, subtotal, taxTotal, total: round(subtotal + taxTotal) };
}

export async function saveInvoice(invoice: FinanceInvoice) {
  await prisma.appSetting.upsert({
    where: { key: invoiceKey(invoice.id) },
    create: { key: invoiceKey(invoice.id), value: JSON.stringify(invoice) },
    update: { value: JSON.stringify(invoice) },
  });
  return invoice;
}

function parseInvoice(value: string): FinanceInvoice | null {
  try {
    const invoice = JSON.parse(value) as FinanceInvoice;
    if (!invoice?.id || !invoice.invoiceNumber || !invoice.clientId || !Array.isArray(invoice.lines)) return null;
    return invoice;
  } catch { return null; }
}

export async function getInvoice(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: invoiceKey(id) }, select: { value: true } });
  return row ? parseInvoice(row.value) : null;
}

export async function listInvoices(limit = 1000) {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: INVOICE_PREFIX } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: { value: true },
  });
  return rows.map((r) => parseInvoice(r.value)).filter((v): v is FinanceInvoice => Boolean(v));
}

export async function invoicePaymentFacts(invoice: FinanceInvoice) {
  const ids = [...new Set(invoice.payments.map((p) => p.paymentId).filter(Boolean))];
  if (!ids.length) return { confirmed: 0, pending: 0, confirmedPayments: [] as Array<{ id: string; reference: string; amount: number; currency: string; paidAt: Date | null }> };

  const allocationByPayment = new Map<string, number>();
  for (const link of invoice.payments) {
    const amount = Math.max(0, Number(link.amountApplied || 0));
    allocationByPayment.set(link.paymentId, round((allocationByPayment.get(link.paymentId) || 0) + amount));
  }

  const rows = await prisma.payment.findMany({
    where: { id: { in: ids } },
    select: { id: true, reference: true, amount: true, currency: true, status: true, paidAt: true },
  });

  const appliedAmount = (payment: { id: string; amount: unknown }) => {
    const actual = Math.max(0, Number(payment.amount));
    const allocated = allocationByPayment.get(payment.id);
    return round(Math.min(actual, allocated == null ? actual : Math.max(0, allocated)));
  };

  const confirmedPayments = rows
    .filter((p) => ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status))
    .map((p) => ({ id: p.id, reference: p.reference, amount: appliedAmount(p), currency: p.currency, paidAt: p.paidAt }));
  const confirmed = round(confirmedPayments.reduce((s, p) => s + (p.currency === invoice.currency ? p.amount : 0), 0));
  const pending = round(rows
    .filter((p) => p.status === "PENDING" && p.currency === invoice.currency)
    .reduce((s, p) => s + appliedAmount(p), 0));
  return { confirmed, pending, confirmedPayments };
}

export async function invoiceFinancialState(invoice: FinanceInvoice, now = new Date()) {
  const facts = await invoicePaymentFacts(invoice);
  const paid = Math.min(invoice.total, facts.confirmed);
  const balance = round(Math.max(0, invoice.total - paid));
  const overdue = invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && balance > 0 && new Date(invoice.dueDate).getTime() < now.getTime();
  let effectiveStatus: InvoiceStatus | "OVERDUE" = invoice.status;
  if (invoice.status !== "CANCELLED" && invoice.status !== "DRAFT") {
    if (balance <= 0) effectiveStatus = "PAID";
    else if (paid > 0) effectiveStatus = overdue ? "OVERDUE" : "PARTIALLY_PAID";
    else effectiveStatus = overdue ? "OVERDUE" : "SENT";
  }
  return { ...facts, paid, balance, overdue, effectiveStatus };
}

export function agingBucket(dueDate: string, balance: number, now = new Date()) {
  if (balance <= 0) return "CURRENT" as const;
  const days = Math.floor((now.getTime() - new Date(dueDate).getTime()) / 86_400_000);
  if (days <= 0) return "CURRENT" as const;
  if (days <= 30) return "1_30" as const;
  if (days <= 60) return "31_60" as const;
  if (days <= 90) return "61_90" as const;
  return "90_PLUS" as const;
}

export async function getAccountsReceivableSnapshot(now = new Date()) {
  const invoices = await listInvoices(3000);
  const rows = await Promise.all(invoices.filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT").map(async (invoice) => {
    const state = await invoiceFinancialState(invoice, now);
    return { invoice, ...state, aging: agingBucket(invoice.dueDate, state.balance, now) };
  }));
  const byCurrency = new Map<string, { current: number; d1_30: number; d31_60: number; d61_90: number; d90Plus: number; total: number }>();
  for (const row of rows) {
    const cur = byCurrency.get(row.invoice.currency) || { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90Plus: 0, total: 0 };
    if (row.aging === "CURRENT") cur.current = round(cur.current + row.balance);
    else if (row.aging === "1_30") cur.d1_30 = round(cur.d1_30 + row.balance);
    else if (row.aging === "31_60") cur.d31_60 = round(cur.d31_60 + row.balance);
    else if (row.aging === "61_90") cur.d61_90 = round(cur.d61_90 + row.balance);
    else cur.d90Plus = round(cur.d90Plus + row.balance);
    cur.total = round(cur.total + row.balance);
    byCurrency.set(row.invoice.currency, cur);
  }
  return { rows, byCurrency: [...byCurrency.entries()].map(([currency, values]) => ({ currency, ...values })).sort((a, b) => a.currency.localeCompare(b.currency)) };
}
