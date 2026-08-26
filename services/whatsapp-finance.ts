"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getWhatsAppConfig, sendWhatsAppDocumentTemplate, uploadWhatsAppMedia } from "@/lib/whatsapp";
import { getInvoice, invoiceFinancialState } from "@/lib/finance-invoices";
import { refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { ensureReceiptMeta, recordReceiptPdf } from "@/lib/finance-receipts";
import { getUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";
import { getManualTransferOrder } from "@/lib/finance-manual-transfers";
import { renderInvoicePdf, renderRefundPdf, renderFinancialMovementReceiptPdf } from "@/services/pdf/finance-documents";
import { renderReceiptPdf } from "@/services/pdf";
import { renderManualTransferOrderPdf } from "@/services/pdf/manual-transfer-order";

function cleanPhone(value: string | null | undefined) {
  return String(value || "").trim();
}

async function deliverFinancePdf(input: {
  userId: string;
  clientId: string;
  to: string;
  bytes: Uint8Array | Buffer;
  filename: string;
  documentLabel: string;
  reference: string;
  clientName: string;
  auditAction: string;
  resourceType: string;
  resourceId: string;
}) {
  const cfg = await getWhatsAppConfig();
  if (!cfg.defaultTemplate) throw new Error("Configure the approved jun_document_notification template in Settings → WhatsApp first");
  if (!cfg.tokenConfigured || !cfg.phoneNumberId) throw new Error("Configure Meta WhatsApp credentials in Settings → WhatsApp first");

  const mediaId = await uploadWhatsAppMedia(Buffer.from(input.bytes), "application/pdf", input.filename);
  const result = await sendWhatsAppDocumentTemplate({
    to: input.to,
    templateName: cfg.defaultTemplate,
    languageCode: cfg.languageCode,
    mediaId,
    filename: input.filename,
    clientName: input.clientName,
    documentLabel: input.documentLabel,
    reference: input.reference,
  });
  const messageId = result.messages?.[0]?.id ?? null;

  await audit({
    userId: input.userId,
    action: input.auditAction,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    after: { clientId: input.clientId, to: input.to, messageId, mediaId, template: cfg.defaultTemplate, reference: input.reference },
  });
  await prisma.activity.create({
    data: {
      userId: input.userId,
      clientId: input.clientId,
      type: "WHATSAPP_ACCEPTED",
      message: `${input.documentLabel} ${input.reference} accepted by Meta for WhatsApp delivery to ${input.to}${messageId ? ` · ${messageId}` : ""}`,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    },
  }).catch(() => null);

  return messageId;
}

export async function sendFinanceInvoiceByWhatsApp(invoiceId: string) {
  const user = await assertPermission("INVOICE_READ");
  const invoice = await getInvoice(invoiceId);
  if (!invoice) redirect("/app/finance/invoices?toast_error=Invoice not found");

  const state = await invoiceFinancialState(invoice);
  const [client, linkedCase] = await Promise.all([
    prisma.client.findUnique({ where: { id: invoice.clientId }, select: { id: true, firstName: true, lastName: true, internalId: true, email: true, phone: true, whatsapp: true, address: true, country: true } }),
    invoice.caseId ? prisma.case.findUnique({ where: { id: invoice.caseId }, select: { caseNumber: true, title: true } }) : Promise.resolve(null),
  ]);
  if (!client) redirect(`/app/finance/invoices/${invoiceId}?toast_error=${encodeURIComponent("Client not found")}`);
  const to = cleanPhone(client.whatsapp || client.phone);
  if (!to) redirect(`/app/finance/invoices/${invoiceId}?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);

  let errorMessage = "";
  try {
    const bytes = await renderInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      title: invoice.title,
      status: state.effectiveStatus,
      clientName: `${client.firstName} ${client.lastName}`,
      clientId: client.internalId,
      email: client.email,
      phone: client.phone,
      address: [client.address, client.country].filter(Boolean).join(", "),
      caseLabel: linkedCase ? `${linkedCase.caseNumber} - ${linkedCase.title}` : null,
      currency: invoice.currency,
      issueDate: new Date(invoice.issueDate),
      dueDate: new Date(invoice.dueDate),
      lines: invoice.lines,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      paid: state.paid,
      balance: state.balance,
      notes: invoice.notes,
      terms: invoice.terms,
    });
    await deliverFinancePdf({ userId: user.id, clientId: client.id, to, bytes, filename: `${invoice.invoiceNumber}.pdf`, documentLabel: "Invoice", reference: invoice.invoiceNumber, clientName: `${client.firstName} ${client.lastName}`.trim(), auditAction: "WHATSAPP_INVOICE_SEND", resourceType: "Invoice", resourceId: invoice.id });
    revalidatePath(`/app/finance/invoices/${invoice.id}`);
    revalidatePath(`/app/clients/${client.id}`);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "WhatsApp invoice send failed";
  }
  if (errorMessage) redirect(`/app/finance/invoices/${invoiceId}?toast_error=${encodeURIComponent(errorMessage)}`);
  redirect(`/app/finance/invoices/${invoiceId}?toast=${encodeURIComponent("Invoice accepted by Meta — awaiting delivery confirmation")}`);
}

export async function sendFinanceRefundByWhatsApp(refundId: string) {
  const user = await assertPermission("REFUND_READ");
  const r = await prisma.refund.findUnique({ where: { id: refundId }, include: { client: true, case: true, payment: true, installments: { orderBy: { dueDate: "asc" } } } });
  if (!r) redirect("/app/finance/refunds?toast_error=Refund not found");
  const to = cleanPhone(r.client.whatsapp || r.client.phone);
  if (!to) redirect(`/app/finance/refunds/${refundId}?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);

  let errorMessage = "";
  try {
    const paid = refundPaidTotal(r.installments);
    const remaining = refundRemaining(r.amount, r.installments);
    const bytes = await renderRefundPdf({
      refundNumber: r.refundNumber,
      status: r.status,
      clientName: `${r.client.firstName} ${r.client.lastName}`,
      clientId: r.client.internalId,
      currency: r.currency,
      amount: Number(r.amount),
      paid,
      remaining,
      reason: r.reason,
      createdAt: r.createdAt,
      paymentReference: r.payment?.reference || null,
      caseNumber: r.case?.caseNumber || null,
      installments: r.installments.map(i => ({ number: i.number, amount: Number(i.amount), dueDate: i.dueDate, status: i.status, paidAt: i.paidAt })),
    });
    await deliverFinancePdf({ userId: user.id, clientId: r.client.id, to, bytes, filename: `${r.refundNumber}.pdf`, documentLabel: "Refund / Withdrawal Statement", reference: r.refundNumber, clientName: `${r.client.firstName} ${r.client.lastName}`.trim(), auditAction: "WHATSAPP_REFUND_SEND", resourceType: "Refund", resourceId: r.id });
    revalidatePath(`/app/finance/refunds/${r.id}`);
    revalidatePath(`/app/clients/${r.client.id}`);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "WhatsApp refund send failed";
  }
  if (errorMessage) redirect(`/app/finance/refunds/${refundId}?toast_error=${encodeURIComponent(errorMessage)}`);
  redirect(`/app/finance/refunds/${refundId}?toast=${encodeURIComponent("Refund PDF accepted by Meta — awaiting delivery confirmation")}`);
}

export async function sendPaymentReceiptByWhatsApp(paymentId: string) {
  const user = await assertPermission("PAYMENT_READ");
  const payment = await prisma.payment.findFirst({
    where: { OR: [{ id: paymentId }, { reference: paymentId }] },
    include: { client: true, case: true, recordedBy: true },
  });
  if (!payment) redirect("/app/finance/receipts?toast_error=Receipt not found");
  if (!payment.paidAt || !["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) redirect(`/app/finance/receipts/${payment.id}?toast_error=${encodeURIComponent("Receipt unavailable until the payment is confirmed")}`);
  const meta = await ensureReceiptMeta(payment);
  if (meta.status === "VOID") redirect(`/app/finance/receipts/${payment.id}?toast_error=${encodeURIComponent("This receipt has been voided")}`);
  const to = cleanPhone(payment.client.whatsapp || payment.client.phone);
  if (!to) redirect(`/app/finance/receipts/${payment.id}?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);

  let errorMessage = "";
  try {
    const bytes = await renderReceiptPdf({
      reference: meta.receiptReference,
      clientName: `${payment.client.firstName} ${payment.client.lastName}`,
      clientInternalId: payment.client.internalId,
      amount: Number(payment.amount),
      currency: payment.currency,
      method: payment.method,
      paymentReference: payment.reference,
      paidAt: payment.paidAt,
      issuedAt: new Date(meta.issuedAt),
      caseNumber: payment.case?.caseNumber ?? null,
      reason: payment.notes ?? null,
      issuerName: `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`,
    });
    await recordReceiptPdf(payment.id, bytes);
    await deliverFinancePdf({ userId: user.id, clientId: payment.client.id, to, bytes, filename: `${meta.receiptReference}.pdf`, documentLabel: "Official Payment Receipt", reference: meta.receiptReference, clientName: `${payment.client.firstName} ${payment.client.lastName}`.trim(), auditAction: "WHATSAPP_PAYMENT_RECEIPT_SEND", resourceType: "Payment", resourceId: payment.id });
    revalidatePath(`/app/finance/receipts/${payment.id}`);
    revalidatePath(`/app/clients/${payment.client.id}`);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "WhatsApp receipt send failed";
  }
  if (errorMessage) redirect(`/app/finance/receipts/${payment.id}?toast_error=${encodeURIComponent(errorMessage)}`);
  redirect(`/app/finance/receipts/${payment.id}?toast=${encodeURIComponent("Receipt accepted by Meta — awaiting delivery confirmation")}`);
}

export async function sendUniversalFinanceReceiptByWhatsApp(receiptId: string, returnOrderId?: string) {
  const user = await assertPermission("PAYMENT_READ");
  const receipt = await getUniversalFinancialReceipt(receiptId);
  const returnPath = returnOrderId ? `/app/finance/manual-transfers/${returnOrderId}` : "/app/finance/receipts";
  if (!receipt) redirect(`${returnPath}?toast_error=${encodeURIComponent("Financial receipt not found")}`);
  if (!receipt.clientId) redirect(`${returnPath}?toast_error=${encodeURIComponent("This financial receipt is not linked to a client")}`);
  const client = await prisma.client.findUnique({ where: { id: receipt.clientId }, select: { id: true, firstName: true, lastName: true, internalId: true, phone: true, whatsapp: true } });
  if (!client) redirect(`${returnPath}?toast_error=${encodeURIComponent("Client not found")}`);
  const to = cleanPhone(client.whatsapp || client.phone);
  if (!to) redirect(`${returnPath}?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);

  let errorMessage = "";
  try {
    const bytes = await renderFinancialMovementReceiptPdf({ receiptNumber: receipt.receiptNumber, title: receipt.title, clientName: `${client.firstName} ${client.lastName}`, clientId: client.internalId, amount: receipt.amount, currency: receipt.currency, direction: receipt.direction, status: receipt.status, description: receipt.description, method: receipt.method, transactionReference: receipt.transactionReference, sourceType: receipt.sourceType, issuedAt: new Date(receipt.issuedAt) });
    await deliverFinancePdf({ userId: user.id, clientId: client.id, to, bytes, filename: `${receipt.receiptNumber}.pdf`, documentLabel: receipt.title || "Financial Receipt", reference: receipt.receiptNumber, clientName: `${client.firstName} ${client.lastName}`.trim(), auditAction: "WHATSAPP_FINANCIAL_RECEIPT_SEND", resourceType: "UniversalFinancialReceipt", resourceId: receipt.id });
    revalidatePath(returnPath);
    revalidatePath(`/app/clients/${client.id}`);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "WhatsApp financial receipt send failed";
  }
  if (errorMessage) redirect(`${returnPath}?toast_error=${encodeURIComponent(errorMessage)}`);
  redirect(`${returnPath}?toast=${encodeURIComponent("Financial receipt accepted by Meta — awaiting delivery confirmation")}`);
}

export async function sendManualTransferOrderByWhatsApp(orderId: string) {
  const user = await assertPermission("PAYMENT_READ");
  const order = await getManualTransferOrder(orderId);
  if (!order) redirect("/app/finance/manual-transfers?toast_error=Manual transfer order not found");
  if (!order.clientId) redirect(`/app/finance/manual-transfers/${orderId}?toast_error=${encodeURIComponent("This payment order is not linked to a client")}`);
  const client = await prisma.client.findUnique({ where: { id: order.clientId }, select: { id: true, firstName: true, lastName: true, phone: true, whatsapp: true } });
  if (!client) redirect(`/app/finance/manual-transfers/${orderId}?toast_error=${encodeURIComponent("Client not found")}`);
  const to = cleanPhone(client.whatsapp || client.phone);
  if (!to) redirect(`/app/finance/manual-transfers/${orderId}?toast_error=${encodeURIComponent("Client has no WhatsApp number")}`);

  let errorMessage = "";
  try {
    const bytes = await renderManualTransferOrderPdf(order);
    const filename = `${String(order.orderNumber || "manual-payment-order").replace(/[^a-zA-Z0-9._-]+/g, "-")}.pdf`;
    await deliverFinancePdf({ userId: user.id, clientId: client.id, to, bytes, filename, documentLabel: "Manual Payment Order", reference: order.orderNumber, clientName: `${client.firstName} ${client.lastName}`.trim(), auditAction: "WHATSAPP_MANUAL_TRANSFER_ORDER_SEND", resourceType: "ManualTransferOrder", resourceId: order.id });
    revalidatePath(`/app/finance/manual-transfers/${order.id}`);
    revalidatePath(`/app/clients/${client.id}`);
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : "WhatsApp payment order send failed";
  }
  if (errorMessage) redirect(`/app/finance/manual-transfers/${orderId}?toast_error=${encodeURIComponent(errorMessage)}`);
  redirect(`/app/finance/manual-transfers/${orderId}?toast=${encodeURIComponent("Payment order accepted by Meta — awaiting delivery confirmation")}`);
}
