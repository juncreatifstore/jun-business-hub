"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMeta, savePaymentCoreMeta } from "@/lib/finance-payment-core";
import { paymentEditMode, refundEditMode, expenseEditMode, invoiceEditMode } from "@/lib/edit-policy";
import { getRefundWorkflowMeta, saveRefundWorkflowMeta } from "@/lib/finance-refund-workflow";
import { getClientAvailableBalance } from "@/lib/client-financial-account";
import { splitInstallments } from "@/lib/money";
import { EXPENSE_CATEGORIES, getFinanceExpense, saveFinanceExpense, type ExpenseCategory, type FinanceExpense } from "@/lib/finance-expenses";
import { calculateInvoiceLines, getInvoice, invoiceFinancialState, saveInvoice, type InvoiceLine } from "@/lib/finance-invoices";
import type { PaymentMethod } from "@prisma/client";

const PAYMENT_METHODS: PaymentMethod[] = ["ZELLE", "STRIPE", "PAYPAL", "MERCADO_PAGO", "BANK_TRANSFER", "CASH", "MONCASH", "OTHER"];

function text(fd: FormData, key: string, max = 3000) { return String(fd.get(key) || "").trim().slice(0, max); }
function money(fd: FormData, key: string) { const n = Number(fd.get(key)); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
function fail(path: string, msg: string): never { redirect(`${path}?toast_error=${encodeURIComponent(msg)}`); }
function correctionReason(fd: FormData, path: string) { const r = text(fd, "correctionReason", 1000); if (!r) fail(path, "Correction reason is required"); return r; }
function refreshClientAccount(clientId: string | null | undefined) {
  if (!clientId) return;
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/account`);
  revalidatePath(`/app/clients/${clientId}/statement`);
}

export async function correctPayment(id: string, fd: FormData) {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p) redirect("/app/finance/payments");
  const mode = paymentEditMode(p.status);
  const path = `/app/finance/payments/${id}/edit`;
  if (mode === "LOCKED") fail(path, "This payment is locked. Use a reversal/replacement instead of overwriting history.");
  const user = await assertPermission(mode === "DIRECT" ? "PAYMENT_CREATE" : "PAYMENT_APPROVE");
  const reason = correctionReason(fd, path);
  const meta = await getPaymentCoreMeta(id);
  const providerRef = text(fd, "providerRef", 160) || null;
  const notes = text(fd, "notes", 2000) || null;
  const serviceLabel = text(fd, "serviceLabel", 160) || null;

  if (mode === "CORRECTION") {
    await prisma.payment.update({ where: { id }, data: { providerRef, notes } });
    await savePaymentCoreMeta(id, { ...meta, serviceLabel, providerRef });
    await audit({ userId: user.id, action: "PAYMENT_CORRECTION", resourceType: "Payment", resourceId: id, before: { providerRef: p.providerRef, notes: p.notes, serviceLabel: meta.serviceLabel, status: p.status }, after: { providerRef, notes, serviceLabel, status: p.status, correctionReason: reason, financialFieldsLocked: true } });
    refreshClientAccount(p.clientId);
    revalidatePath(`/app/finance/payments/${id}`);
    redirect(`/app/finance/payments/${id}?toast=${encodeURIComponent("Payment reference/details corrected")}`);
  }

  const clientId = text(fd, "clientId", 100);
  const caseId = text(fd, "caseId", 100) || null;
  const amount = money(fd, "amount");
  const currency = text(fd, "currency", 3).toUpperCase();
  const method = text(fd, "method", 40).toUpperCase() as PaymentMethod;
  if (!clientId || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !PAYMENT_METHODS.includes(method)) fail(path, "Invalid payment correction data");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) fail(path, "Client not found");
  if (caseId) { const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } }); if (!c || c.clientId !== clientId) fail(path, "Case does not belong to selected client"); }
  const paidAtRaw = text(fd, "paidAt", 20);
  const paidAt = paidAtRaw ? new Date(`${paidAtRaw}T12:00:00`) : null;
  if (paidAt && Number.isNaN(paidAt.getTime())) fail(path, "Invalid payment date");
  const expectedRaw = text(fd, "expectedAmount", 40);
  const expectedAmount = expectedRaw ? Number(expectedRaw) : null;
  if (expectedAmount != null && (!Number.isFinite(expectedAmount) || expectedAmount <= 0)) fail(path, "Invalid expected amount");

  const before = { clientId: p.clientId, caseId: p.caseId, amount: Number(p.amount), currency: p.currency, method: p.method, providerRef: p.providerRef, paidAt: p.paidAt, notes: p.notes, serviceLabel: meta.serviceLabel, expectedAmount: meta.expectedAmount };
  const updated = await prisma.payment.update({ where: { id }, data: { clientId, caseId, amount, currency, method, providerRef, paidAt, notes } });
  await savePaymentCoreMeta(id, { ...meta, providerRef, serviceLabel, expectedAmount });
  await audit({ userId: user.id, action: "PAYMENT_CORRECTION", resourceType: "Payment", resourceId: id, before, after: { clientId, caseId, amount, currency, method, providerRef, paidAt, notes, serviceLabel, expectedAmount, correctionReason: reason } });
  await logActivity({ userId: user.id, type: "PAYMENT_UPDATED", message: `Payment ${updated.reference} corrected: ${reason}`, clientId, caseId });
  refreshClientAccount(p.clientId);
  refreshClientAccount(clientId);
  revalidatePath(`/app/finance/payments/${id}`);
  revalidatePath("/app/finance/payments");
  redirect(`/app/finance/payments/${id}?toast=${encodeURIComponent("Payment corrected")}`);
}

export async function correctRefund(id: string, fd: FormData) {
  const r = await prisma.refund.findUnique({ where: { id }, include: { installments: true } });
  if (!r) redirect("/app/finance/refunds");
  const mode = refundEditMode(r.status, r.installments.filter((i) => i.status === "PAID").length);
  const path = `/app/finance/refunds/${id}/edit`;
  if (mode === "LOCKED") fail(path, "Refund is locked because money was paid or the request is final.");
  const user = await assertPermission(r.status === "APPROVED" ? "REFUND_APPROVE" : "REFUND_CREATE");
  const reason = correctionReason(fd, path);
  const clientId = text(fd, "clientId", 100);
  const caseId = text(fd, "caseId", 100) || null;
  const paymentId = text(fd, "paymentId", 100) || null;
  const amount = money(fd, "amount");
  const reasonText = text(fd, "reason", 2000);
  const currencyInput = text(fd, "currency", 3).toUpperCase();
  if (!clientId || !reasonText || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currencyInput)) fail(path, "Invalid refund correction data");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) fail(path, "Client not found");
  if (caseId) { const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } }); if (!c || c.clientId !== clientId) fail(path, "Case does not belong to selected client"); }

  let currency = currencyInput;
  let refundType: "FULL" | "PARTIAL" | "UNLINKED" = "UNLINKED";
  if (paymentId) {
    const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { refunds: true } });
    if (!p || p.clientId !== clientId) fail(path, "Original payment does not belong to selected client");
    if (!["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)) fail(path, "Only confirmed payments can be refunded");
    currency = p.currency;
    const committed = p.refunds.filter((x) => x.id !== id && !["REJECTED", "CANCELLED"].includes(x.status)).reduce((s, x) => s + Number(x.amount), 0);
    const available = Math.max(0, Math.round((Number(p.amount) - committed) * 100) / 100);
    if (amount > available + 0.005) fail(path, `Refund exceeds available amount (${currency} ${available.toFixed(2)})`);
    refundType = Math.abs(amount - available) < 0.005 ? "FULL" : "PARTIAL";
  }
  if (r.status === "APPROVED") {
    const currentAvailable = await getClientAvailableBalance(clientId, currency);
    const sameClientCurrency = r.clientId === clientId && r.currency === currency;
    const availableWithCurrentReleased = sameClientCurrency ? currentAvailable + Number(r.amount) : currentAvailable;
    if (amount > availableWithCurrentReleased + 0.005) fail(path, `Correction exceeds client available balance (${currency} ${availableWithCurrentReleased.toFixed(2)})`);
  }

  const workflow = await getRefundWorkflowMeta(id);
  const before = { clientId: r.clientId, caseId: r.caseId, paymentId: r.paymentId, amount: Number(r.amount), currency: r.currency, reason: r.reason, status: r.status, refundType: workflow.refundType };
  const parts = splitInstallments(amount, Math.max(1, r.installments.length));
  await prisma.$transaction(async (tx) => {
    await tx.refund.update({ where: { id }, data: { clientId, caseId, paymentId, amount, currency, reason: reasonText, ...(r.status === "APPROVED" ? { status: "UNDER_REVIEW", approvedById: null } : {}) } });
    for (let i = 0; i < r.installments.length; i++) await tx.refundInstallment.update({ where: { id: r.installments[i].id }, data: { amount: parts[i].amount } });
  });
  await saveRefundWorkflowMeta(id, { refundType, ...(r.status === "APPROVED" ? { decisionReason: "", decidedAt: null, decidedById: null } : {}) });
  await audit({ userId: user.id, action: "REFUND_CORRECTION", resourceType: "Refund", resourceId: id, before, after: { clientId, caseId, paymentId, amount, currency, reason: reasonText, status: r.status === "APPROVED" ? "UNDER_REVIEW" : r.status, refundType, correctionReason: reason, reapprovalRequired: r.status === "APPROVED" } });
  await logActivity({ userId: user.id, type: "REFUND_UPDATED", message: `Refund ${r.refundNumber} corrected: ${reason}`, clientId, caseId });
  refreshClientAccount(r.clientId);
  refreshClientAccount(clientId);
  revalidatePath(`/app/finance/refunds/${id}`);
  revalidatePath("/app/finance/refunds");
  redirect(`/app/finance/refunds/${id}?toast=${encodeURIComponent(r.status === "APPROVED" ? "Refund corrected and returned to review" : "Refund corrected")}`);
}

export async function correctExpense(id: string, fd: FormData) {
  const e = await getFinanceExpense(id);
  if (!e) redirect("/app/finance/expenses");
  const mode = expenseEditMode(e.status, e.payments.length);
  const path = `/app/finance/expenses/${id}/edit`;
  if (mode === "LOCKED") fail(path, "Expense is locked because it has payments or is final.");
  const user = await assertPermission(e.status === "APPROVED" ? "EXPENSE_APPROVE" : "EXPENSE_CREATE");
  const reason = correctionReason(fd, path);
  const vendorName = text(fd, "vendorName", 200), vendorCountry = text(fd, "vendorCountry", 120), category = text(fd, "category", 60) as ExpenseCategory, description = text(fd, "description", 3000), invoiceNumber = text(fd, "invoiceNumber", 120), amount = money(fd, "amount"), currency = text(fd, "currency", 3).toUpperCase(), dueDate = text(fd, "dueDate", 20) || null, clientId = text(fd, "clientId", 100) || null, caseId = text(fd, "caseId", 100) || null;
  if (!vendorName || !description || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !EXPENSE_CATEGORIES.includes(category)) fail(path, "Invalid expense correction data");
  if (caseId) { const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } }); if (!c || (clientId && c.clientId !== clientId)) fail(path, "Case does not belong to selected client"); }
  const status: FinanceExpense["status"] = e.status === "APPROVED" ? "SUBMITTED" : e.status;
  const next: FinanceExpense = { ...e, vendorName, vendorCountry, category, description, invoiceNumber, amount, currency, dueDate, clientId, caseId, status, approvedById: e.status === "APPROVED" ? null : e.approvedById, decisionNote: e.status === "APPROVED" ? "" : e.decisionNote, updatedAt: new Date().toISOString() };
  await saveFinanceExpense(next);
  await audit({ userId: user.id, action: "EXPENSE_CORRECTION", resourceType: "Expense", resourceId: id, before: { vendorName: e.vendorName, vendorCountry: e.vendorCountry, category: e.category, description: e.description, invoiceNumber: e.invoiceNumber, amount: e.amount, currency: e.currency, dueDate: e.dueDate, clientId: e.clientId, caseId: e.caseId, status: e.status }, after: { vendorName, vendorCountry, category, description, invoiceNumber, amount, currency, dueDate, clientId, caseId, status, correctionReason: reason, reapprovalRequired: e.status === "APPROVED" } });
  revalidatePath(`/app/finance/expenses/${id}`);
  revalidatePath("/app/finance/expenses");
  redirect(`/app/finance/expenses/${id}?toast=${encodeURIComponent(e.status === "APPROVED" ? "Expense corrected and returned for approval" : "Expense corrected")}`);
}

function invoiceLines(fd: FormData) {
  const descriptions = fd.getAll("lineDescription").map(String), quantities = fd.getAll("lineQuantity").map(Number), prices = fd.getAll("lineUnitPrice").map(Number), taxes = fd.getAll("lineTaxRate").map(Number);
  const lines: Array<Pick<InvoiceLine, "description" | "quantity" | "unitPrice" | "taxRate">> = [];
  for (let i = 0; i < descriptions.length; i++) lines.push({ description: descriptions[i] || "", quantity: quantities[i] || 0, unitPrice: prices[i] || 0, taxRate: taxes[i] || 0 });
  return calculateInvoiceLines(lines);
}

export async function correctInvoice(id: string, fd: FormData) {
  const inv = await getInvoice(id);
  if (!inv) redirect("/app/finance/invoices");
  const state = await invoiceFinancialState(inv);
  const mode = invoiceEditMode(state.effectiveStatus, state.confirmed);
  const path = `/app/finance/invoices/${id}/edit`;
  if (mode === "LOCKED") fail(path, "Invoice is locked because it has confirmed payments or is final.");
  const user = await assertPermission("INVOICE_CREATE");
  const reason = correctionReason(fd, path);
  const clientId = text(fd, "clientId", 100), caseId = text(fd, "caseId", 100) || null, currency = text(fd, "currency", 3).toUpperCase(), title = text(fd, "title", 200), notes = text(fd, "notes", 2000), terms = text(fd, "terms", 2000), dueDateRaw = text(fd, "dueDate", 20), calc = invoiceLines(fd);
  if (!clientId || !title || !/^[A-Z]{3}$/.test(currency) || !dueDateRaw || calc.total <= 0) fail(path, "Invalid invoice correction data");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }); if (!client) fail(path, "Client not found");
  if (caseId) { const c = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } }); if (!c || c.clientId !== clientId) fail(path, "Case does not belong to selected client"); }
  const due = new Date(`${dueDateRaw}T23:59:59.999Z`); if (Number.isNaN(due.getTime())) fail(path, "Invalid due date");
  const wasSent = inv.status !== "DRAFT";
  const next = { ...inv, clientId, caseId, currency, title, notes, terms, dueDate: due.toISOString(), ...calc, status: wasSent ? "DRAFT" as const : inv.status, sentAt: wasSent ? null : inv.sentAt, updatedAt: new Date().toISOString() };
  await saveInvoice(next);
  await audit({ userId: user.id, action: "INVOICE_CORRECTION", resourceType: "FinanceInvoice", resourceId: id, before: { clientId: inv.clientId, caseId: inv.caseId, currency: inv.currency, title: inv.title, dueDate: inv.dueDate, total: inv.total, status: inv.status }, after: { clientId, caseId, currency, title, dueDate: next.dueDate, total: next.total, status: next.status, correctionReason: reason, resendRequired: wasSent } });
  revalidatePath(`/app/finance/invoices/${id}`);
  revalidatePath("/app/finance/invoices");
  redirect(`/app/finance/invoices/${id}?toast=${encodeURIComponent(wasSent ? "Invoice corrected and returned to draft for re-send" : "Invoice corrected")}`);
}
