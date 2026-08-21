"use server";

import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getManualTransferOrder } from "@/lib/finance-manual-transfers";
import { ensureUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { setManualTransferOrderStatus } from "@/services/finance-manual-transfers";

const MANUAL_PAYMENT_LINK_PREFIX = "finance.manual.payment.";

async function getLinkedPaymentId(orderId: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${MANUAL_PAYMENT_LINK_PREFIX}${orderId}` }, select: { value: true } });
  return row?.value || null;
}

async function ensureCompletedTransferPayment(orderId: string, userId: string) {
  const order = await getManualTransferOrder(orderId);
  if (!order || order.status !== "COMPLETED" || !order.clientId) return null;

  // A manual transfer payment represents what JUN actually received after
  // provider/transfer fees and FX, not the gross amount paid by the sender.
  const receivedAmount = Number(order.receiveAmount);
  const receivedCurrency = order.receiveCurrency;
  const provider = order.receiverSnapshot.rail === "WESTERN_UNION"
    ? "Western Union"
    : (order.receiverSnapshot.bankName || "Bank transfer");
  const method = order.receiverSnapshot.rail === "BANK_TRANSFER" ? "BANK_TRANSFER" : "OTHER";
  const notes = `Net client payment received for manual transfer order ${order.orderNumber}. Sender paid ${order.sendCurrency} ${order.sendAmount.toFixed(2)}; transfer fees ${order.sendCurrency} ${order.feeAmount.toFixed(2)}; net received ${receivedCurrency} ${receivedAmount.toFixed(2)}. ${order.purpose || "Commercial payment"}`;

  const linkedId = await getLinkedPaymentId(order.id);
  if (linkedId) {
    const existing = await prisma.payment.findUnique({ where: { id: linkedId } });
    if (existing) {
      const corrected = await prisma.payment.update({
        where: { id: existing.id },
        data: {
          clientId: order.clientId,
          caseId: order.caseId,
          amount: receivedAmount,
          currency: receivedCurrency,
          method,
          status: "CONFIRMED",
          provider,
          providerRef: order.orderNumber,
          notes,
          paidAt: existing.paidAt || new Date(),
        },
      });
      await audit({
        userId,
        action: "MANUAL_TRANSFER_PAYMENT_RECONCILE",
        resourceType: "Payment",
        resourceId: corrected.id,
        before: { amount: Number(existing.amount), currency: existing.currency, status: existing.status },
        after: { amount: receivedAmount, currency: receivedCurrency, status: "CONFIRMED", orderNumber: order.orderNumber },
      });
      return corrected;
    }
  }

  const reference = await nextNumber("PAY");
  const payment = await prisma.payment.create({
    data: {
      reference,
      clientId: order.clientId,
      caseId: order.caseId,
      amount: receivedAmount,
      currency: receivedCurrency,
      method,
      status: "CONFIRMED",
      provider,
      providerRef: order.orderNumber,
      notes,
      paidAt: new Date(),
      recordedById: userId,
    },
  });

  await prisma.appSetting.upsert({
    where: { key: `${MANUAL_PAYMENT_LINK_PREFIX}${order.id}` },
    create: { key: `${MANUAL_PAYMENT_LINK_PREFIX}${order.id}`, value: payment.id },
    update: { value: payment.id },
  });

  await audit({
    userId,
    action: "MANUAL_TRANSFER_PAYMENT_RECORD",
    resourceType: "Payment",
    resourceId: payment.id,
    after: {
      reference,
      orderId: order.id,
      orderNumber: order.orderNumber,
      senderAmount: order.sendAmount,
      senderCurrency: order.sendCurrency,
      transferFee: order.feeAmount,
      amountReceived: receivedAmount,
      currencyReceived: receivedCurrency,
      status: "CONFIRMED",
    },
  });
  return payment;
}

export async function setManualTransferOrderStatusWithReceipt(id: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const target = String(formData.get("status") || "");
  await setManualTransferOrderStatus(id, formData);
  if (target !== "COMPLETED") return;

  const order = await getManualTransferOrder(id);
  if (!order || order.status !== "COMPLETED") return;

  const payment = await ensureCompletedTransferPayment(order.id, user.id);
  await ensureUniversalFinancialReceipt({
    sourceType: "MANUAL_TRANSFER",
    sourceId: order.id,
    clientId: order.clientId,
    amount: order.receiveAmount,
    currency: order.receiveCurrency,
    direction: "CREDIT",
    title: "Client payment receipt",
    description: `${order.orderNumber} · Sender paid ${order.sendCurrency} ${order.sendAmount.toFixed(2)} · Transfer fee ${order.sendCurrency} ${order.feeAmount.toFixed(2)} · Net received ${order.receiveCurrency} ${order.receiveAmount.toFixed(2)} · ${order.purpose || "Commercial payment"} · Receiver: ${order.receiverSnapshot.legalName}`,
    status: "CONFIRMED",
    method: order.receiverSnapshot.rail,
    transactionReference: payment ? `${payment.reference} / ${order.orderNumber}` : order.orderNumber,
    issuedById: user.id,
  });
}

export async function getManualTransferLinkedPayment(orderId: string) {
  const paymentId = await getLinkedPaymentId(orderId);
  if (!paymentId) return null;
  return prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, reference: true, amount: true, currency: true, status: true, paidAt: true } });
}
