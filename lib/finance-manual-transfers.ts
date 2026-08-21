import "server-only";

import { prisma } from "@/lib/prisma";

export const MANUAL_RECEIVER_PREFIX = "finance.manual.receiver.";
export const MANUAL_ORDER_PREFIX = "finance.manual.order.";

export type ManualTransferRail = "WESTERN_UNION" | "BANK_TRANSFER";
export type ManualTransferStatus = "DRAFT" | "ISSUED" | "COMPLETED" | "CANCELLED";

export type ManualTransferReceiver = {
  id: string;
  label: string;
  rail: ManualTransferRail;
  enabled: boolean;
  legalName: string;
  receiverType: "BUSINESS" | "INDIVIDUAL_BUSINESS_REPRESENTATIVE";
  country: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  bankAddress: string;
  accountNumber: string;
  iban: string;
  swiftBic: string;
  routingNumber: string;
  clabe: string;
  branchCode: string;
  currency: string;
  feePercent: number;
  feeFixed: number;
  complianceNote: string;
  createdAt: string;
  updatedAt: string;
};

export type ManualTransferOrder = {
  id: string;
  orderNumber: string;
  status: ManualTransferStatus;
  receiverId: string;
  receiverSnapshot: ManualTransferReceiver;
  clientId: string | null;
  caseId: string | null;
  payerName: string;
  purpose: string;
  originCountry: string;
  destinationCountry: string;
  sendAmount: number;
  sendCurrency: string;
  feeAmount: number;
  netAfterFees: number;
  exchangeRate: number;
  receiveAmount: number;
  receiveCurrency: string;
  language: string;
  instructions: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

function parseReceiver(value: string): ManualTransferReceiver | null {
  try {
    const r = JSON.parse(value) as ManualTransferReceiver;
    if (!r?.id || !r.label || !r.rail || !r.legalName) return null;
    return {
      ...r,
      enabled: r.enabled !== false,
      currency: String(r.currency || "USD").toUpperCase(),
      feePercent: Math.max(0, Number(r.feePercent || 0)),
      feeFixed: Math.max(0, Number(r.feeFixed || 0)),
    };
  } catch { return null; }
}

function parseOrder(value: string): ManualTransferOrder | null {
  try {
    const o = JSON.parse(value) as ManualTransferOrder;
    return o?.id && o.orderNumber && o.receiverSnapshot ? o : null;
  } catch { return null; }
}

export async function getManualTransferReceivers(enabledOnly = false) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: MANUAL_RECEIVER_PREFIX } }, orderBy: { updatedAt: "desc" }, select: { value: true } });
  const values = rows.map((r) => parseReceiver(r.value)).filter((r): r is ManualTransferReceiver => Boolean(r));
  return enabledOnly ? values.filter((r) => r.enabled) : values;
}

export async function getManualTransferReceiver(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${MANUAL_RECEIVER_PREFIX}${id}` }, select: { value: true } });
  return row ? parseReceiver(row.value) : null;
}

export async function getManualTransferOrders() {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: MANUAL_ORDER_PREFIX } }, orderBy: { updatedAt: "desc" }, take: 250, select: { value: true } });
  return rows.map((r) => parseOrder(r.value)).filter((o): o is ManualTransferOrder => Boolean(o));
}

export async function getManualTransferOrder(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${MANUAL_ORDER_PREFIX}${id}` }, select: { value: true } });
  return row ? parseOrder(row.value) : null;
}

export function calculateManualTransfer(sendAmount: number, feePercent: number, feeFixed: number, exchangeRate: number) {
  const feeAmount = Math.round((feeFixed + sendAmount * feePercent / 100) * 100) / 100;
  const netAfterFees = Math.max(0, Math.round((sendAmount - feeAmount) * 100) / 100);
  const receiveAmount = Math.round(netAfterFees * exchangeRate * 100) / 100;
  return { feeAmount, netAfterFees, receiveAmount };
}

export function receiverPaymentDetails(r: ManualTransferReceiver) {
  if (r.rail === "WESTERN_UNION") {
    return [
      `Receiver legal name: ${r.legalName}`,
      r.address ? `Address: ${r.address}` : "",
      r.city || r.country ? `Location: ${[r.city, r.country].filter(Boolean).join(", ")}` : "",
      r.phone ? `Phone: ${r.phone}` : "",
      r.email ? `Email: ${r.email}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `Beneficiary: ${r.legalName}`,
    r.bankName ? `Bank: ${r.bankName}` : "",
    r.bankAddress ? `Bank address: ${r.bankAddress}` : "",
    r.accountNumber ? `Account number: ${r.accountNumber}` : "",
    r.iban ? `IBAN: ${r.iban}` : "",
    r.swiftBic ? `SWIFT/BIC: ${r.swiftBic}` : "",
    r.routingNumber ? `Routing/ABA: ${r.routingNumber}` : "",
    r.clabe ? `CLABE: ${r.clabe}` : "",
    r.branchCode ? `Branch code: ${r.branchCode}` : "",
  ].filter(Boolean).join("\n");
}
