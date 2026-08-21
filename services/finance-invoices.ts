"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { calculateInvoiceLines, getInvoice, invoiceFinancialState, listInvoices, saveInvoice, type FinanceInvoice, type InvoiceLine } from "@/lib/finance-invoices";
import { createProviderCheckout } from "@/lib/finance-online-providers";
import { makeOnlinePublicToken, saveOnlinePaymentSession, type OnlinePaymentProvider, type OnlinePaymentSession } from "@/lib/finance-online-payments";

function dest(id: string, msg: string, error = false) { return `/app/finance/invoices/${encodeURIComponent(id)}?${error ? "toast_error" : "toast"}=${encodeURIComponent(msg)}`; }
function value(fd: FormData, key: string, max = 500) { return String(fd.get(key) || "").trim().slice(0, max); }
function parseLines(fd: FormData) {
  const descriptions = fd.getAll("lineDescription").map(String);
  const quantities = fd.getAll("lineQuantity").map(Number);
  const prices = fd.getAll("lineUnitPrice").map(Number);
  const taxes = fd.getAll("lineTaxRate").map(Number);
  const lines: Array<Pick<InvoiceLine, "description" | "quantity" | "unitPrice" | "taxRate">> = [];
  for (let i = 0; i < descriptions.length; i++) lines.push({ description: descriptions[i] || "", quantity: quantities[i] || 0, unitPrice: prices[i] || 0, taxRate: taxes[i] || 0 });
  return calculateInvoiceLines(lines);
}

export async function createInvoice(formData: FormData) {
  const user = await assertPermission("INVOICE_CREATE");
  const clientId = value(formData, "clientId", 100);
  const caseId = value(formData, "caseId", 100) || null;
  const currency = value(formData, "currency", 3).toUpperCase();
  const dueDateRaw = value(formData, "dueDate", 40);
  const title = value(formData, "title", 200) || "Professional services";
  if (!clientId || currency.length !== 3 || !dueDateRaw) redirect(`/app/finance/invoices/new?toast_error=${encodeURIComponent("Client, due date and 3-letter currency are required")}`);
  const client = await prisma.client.findFirst({ where: { id: clientId, archivedAt: null }, select: { id: true } });
  if (!client) redirect(`/app/finance/invoices/new?toast_error=${encodeURIComponent("Client not found")}`);
  if (caseId) {
    const linkedCase = await prisma.case.findUnique({ where: { id: caseId }, select: { clientId: true } });
    if (!linkedCase || linkedCase.clientId !== clientId) redirect(`/app/finance/invoices/new?toast_error=${encodeURIComponent("Selected case does not belong to client")}`);
  }
  const calc = parseLines(formData);
  if (!calc.lines.length || calc.total <= 0) redirect(`/app/finance/invoices/new?toast_error=${encodeURIComponent("Add at least one positive invoice line")}`);
  const now = new Date();
  const due = new Date(`${dueDateRaw}T23:59:59.999Z`);
  if (Number.isNaN(due.getTime())) redirect(`/app/finance/invoices/new?toast_error=${encodeURIComponent("Invalid due date")}`);
  const invoice: FinanceInvoice = {
    id: randomUUID(), invoiceNumber: await nextNumber("INV"), clientId, caseId, currency,
    issueDate: now.toISOString(), dueDate: due.toISOString(), status: "DRAFT", title,
    notes: value(formData, "notes", 2000), terms: value(formData, "terms", 2000) || "Payment due by the stated due date.",
    ...calc, payments: [], reminders: [], createdById: user.id, createdAt: now.toISOString(), updatedAt: now.toISOString(), sentAt: null, cancelledAt: null, cancellationReason: null,
  };
  await saveInvoice(invoice);
  await audit({ userId: user.id, action: "INVOICE_CREATE", resourceType: "FinanceInvoice", resourceId: invoice.id, after: { invoiceNumber: invoice.invoiceNumber, clientId, caseId, currency, total: invoice.total, dueDate: invoice.dueDate } });
  await logActivity({ type: "INVOICE_CREATED", message: `Invoice ${invoice.invoiceNumber} created (${invoice.currency} ${invoice.total.toFixed(2)})`, userId: user.id, clientId, caseId });
  revalidatePath("/app/finance/invoices");
  redirect(dest(invoice.id, "Invoice draft created"));
}

export async function markInvoiceSent(id: string) {
  const user = await assertPermission("INVOICE_APPROVE");
  const invoice = await getInvoice(id); if (!invoice) redirect("/app/finance/invoices");
  if (invoice.status !== "DRAFT") redirect(dest(id, "Only draft invoices can be sent", true));
  const next = { ...invoice, status: "SENT" as const, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await saveInvoice(next);
  await audit({ userId: user.id, action: "INVOICE_SENT", resourceType: "FinanceInvoice", resourceId: id, before: { status: invoice.status }, after: { status: next.status, sentAt: next.sentAt } });
  revalidatePath(`/app/finance/invoices/${id}`); revalidatePath("/app/finance/invoices");
  redirect(dest(id, "Invoice marked as sent"));
}

export async function cancelInvoice(id: string, formData: FormData) {
  const user = await assertPermission("INVOICE_APPROVE");
  const invoice = await getInvoice(id); if (!invoice) redirect("/app/finance/invoices");
  const state = await invoiceFinancialState(invoice);
  if (state.paid > 0) redirect(dest(id, "An invoice with confirmed payments cannot be cancelled", true));
  if (invoice.status === "CANCELLED") redirect(dest(id, "Invoice is already cancelled", true));
  const reason = value(formData, "reason", 600);
  if (!reason) redirect(dest(id, "Cancellation reason is required", true));
  const next = { ...invoice, status: "CANCELLED" as const, cancelledAt: new Date().toISOString(), cancellationReason: reason, updatedAt: new Date().toISOString() };
  await saveInvoice(next);
  await audit({ userId: user.id, action: "INVOICE_CANCEL", resourceType: "FinanceInvoice", resourceId: id, before: { status: invoice.status }, after: { status: next.status, reason } });
  revalidatePath(`/app/finance/invoices/${id}`); revalidatePath("/app/finance/invoices");
  redirect(dest(id, "Invoice cancelled"));
}

export async function linkPaymentToInvoice(id: string, formData: FormData) {
  const user = await assertPermission("INVOICE_CREATE");
  const invoice = await getInvoice(id); if (!invoice) redirect("/app/finance/invoices");
  if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") redirect(dest(id, "Send the invoice before linking payment", true));
  const paymentId = value(formData, "paymentId", 100);
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, clientId: true, currency: true, amount: true, reference: true } });
  if (!payment || payment.clientId !== invoice.clientId) redirect(dest(id, "Payment does not belong to invoice client", true));
  if (payment.currency !== invoice.currency) redirect(dest(id, "Payment currency does not match invoice currency", true));
  if (invoice.payments.some((p) => p.paymentId === payment.id)) redirect(dest(id, "Payment is already linked", true));
  const allInvoices = await listInvoices(3000);
  const alreadyLinkedElsewhere = allInvoices.some((other) => other.id !== invoice.id && other.payments.some((p) => p.paymentId === payment.id));
  if (alreadyLinkedElsewhere) redirect(dest(id, "Payment is already linked to another invoice", true));
  const state = await invoiceFinancialState(invoice);
  const paymentAmount = Number(payment.amount);
  if (paymentAmount > state.balance + 0.009) redirect(dest(id, "Payment amount exceeds the invoice balance. Use a matching partial payment instead.", true));
  const amountApplied = paymentAmount;
  const next = { ...invoice, payments: [...invoice.payments, { paymentId: payment.id, linkedAt: new Date().toISOString(), linkedById: user.id, amountApplied }], updatedAt: new Date().toISOString() };
  await saveInvoice(next);
  await audit({ userId: user.id, action: "INVOICE_PAYMENT_LINK", resourceType: "FinanceInvoice", resourceId: id, after: { paymentId: payment.id, reference: payment.reference, amountApplied } });
  revalidatePath(`/app/finance/invoices/${id}`); revalidatePath("/app/finance/invoices");
  redirect(dest(id, `Payment ${payment.reference} linked`));
}

export async function recordInvoiceReminder(id: string, formData: FormData) {
  const user = await assertPermission("INVOICE_CREATE");
  const invoice = await getInvoice(id); if (!invoice) redirect("/app/finance/invoices");
  const channelRaw = value(formData, "channel", 20).toUpperCase();
  const channel = channelRaw === "EMAIL" ? "EMAIL" as const : channelRaw === "WHATSAPP" ? "WHATSAPP" as const : "MANUAL" as const;
  const note = value(formData, "note", 600) || "Payment reminder recorded";
  const next = { ...invoice, reminders: [...invoice.reminders, { sentAt: new Date().toISOString(), sentById: user.id, channel, note }], updatedAt: new Date().toISOString() };
  await saveInvoice(next);
  await audit({ userId: user.id, action: "INVOICE_REMINDER", resourceType: "FinanceInvoice", resourceId: id, after: { channel, note } });
  revalidatePath(`/app/finance/invoices/${id}`);
  redirect(dest(id, "Reminder recorded"));
}

export async function createInvoiceOnlinePayment(id: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_CREATE");
  const invoice = await getInvoice(id); if (!invoice) redirect("/app/finance/invoices");
  if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") redirect(dest(id, "Send the invoice before creating a payment link", true));
  const state = await invoiceFinancialState(invoice);
  if (state.balance <= 0) redirect(dest(id, "Invoice is already paid", true));
  const providerRaw = value(formData, "provider", 30).toUpperCase();
  const provider: OnlinePaymentProvider = providerRaw === "PAYPAL" ? "PAYPAL" : providerRaw === "MERCADO_PAGO" ? "MERCADO_PAGO" : "STRIPE";
  const amountRequested = Number(formData.get("amount") || state.balance);
  const amount = Math.round(Math.min(Math.max(amountRequested, 0), state.balance) * 100) / 100;
  if (amount <= 0) redirect(dest(id, "Positive payment amount required", true));
  const client = await prisma.client.findUnique({ where: { id: invoice.clientId }, select: { firstName: true, lastName: true, email: true } });
  if (!client) redirect(dest(id, "Invoice client not found", true));
  const reference = await nextNumber("PAY");
  const payment = await prisma.payment.create({ data: { reference, clientId: invoice.clientId, caseId: invoice.caseId, amount, currency: invoice.currency, method: provider, provider, notes: `Invoice ${invoice.invoiceNumber} payment`, recordedById: user.id } });
  const sessionId = randomUUID();
  const { publicToken, tokenHash } = makeOnlinePublicToken(sessionId);
  const now = new Date();
  let session: OnlinePaymentSession = { id: sessionId, paymentId: payment.id, tokenHash, provider, status: "CREATED", amount, currency: invoice.currency, description: `Invoice ${invoice.invoiceNumber} · ${invoice.title}`, clientName: `${client.firstName} ${client.lastName}`.trim(), clientEmail: client.email, checkoutUrl: null, providerSessionId: null, providerPaymentId: null, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), createdById: user.id, createdAt: now.toISOString(), updatedAt: now.toISOString(), lastError: null };
  await saveOnlinePaymentSession(session);
  let checkout: Awaited<ReturnType<typeof createProviderCheckout>>;
  try {
    checkout = await createProviderCheckout({ provider, sessionId, paymentId: payment.id, publicToken, amount, currency: invoice.currency, description: session.description, clientName: session.clientName, clientEmail: client.email, expiresAt: session.expiresAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Checkout creation failed";
    await saveOnlinePaymentSession({ ...session, status: "FAILED", lastError: message.slice(0, 500), updatedAt: new Date().toISOString() });
    redirect(dest(id, message, true));
  }
  session = { ...session, status: "PENDING", checkoutUrl: checkout.checkoutUrl, providerSessionId: checkout.providerSessionId, updatedAt: new Date().toISOString() };
  await saveOnlinePaymentSession(session);
  await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: checkout.providerSessionId } });
  const next = { ...invoice, payments: [...invoice.payments, { paymentId: payment.id, linkedAt: new Date().toISOString(), linkedById: user.id, amountApplied: amount }], updatedAt: new Date().toISOString() };
  await saveInvoice(next);
  await audit({ userId: user.id, action: "INVOICE_ONLINE_PAYMENT_CREATE", resourceType: "FinanceInvoice", resourceId: id, after: { paymentId: payment.id, reference, provider, amount, sessionId } });
  revalidatePath(`/app/finance/invoices/${id}`); revalidatePath("/app/finance/online-payments");
  redirect(`/app/finance/online-payments/${sessionId}?token=${encodeURIComponent(publicToken)}&toast=${encodeURIComponent(`Payment link created for ${invoice.invoiceNumber}`)}`);
}
