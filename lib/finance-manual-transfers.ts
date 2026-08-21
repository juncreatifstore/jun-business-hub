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
  receiverType: "BUSINESS" | "INDIVIDUAL_BUSINESS_REPRESENTATIVE";
  firstName: string;
  lastName: string;
  legalName: string;
  phone: string;
  email: string;
  country: string;
  city: string;
  address: string;
  bankName: string;
  bankCountry: string;
  bankAddress: string;
  accountHolderName: string;
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
    const raw = JSON.parse(value) as Partial<ManualTransferReceiver> & { id?: string; label?: string; rail?: ManualTransferRail; legalName?: string };
    if (!raw?.id || !raw.label || !raw.rail || !raw.legalName) return null;
    const firstName = String(raw.firstName || "").trim();
    const lastName = String(raw.lastName || "").trim();
    const legalName = String(raw.legalName || [firstName, lastName].filter(Boolean).join(" ")).trim();
    return {
      id: raw.id,
      label: String(raw.label),
      rail: raw.rail,
      enabled: raw.enabled !== false,
      receiverType: raw.receiverType === "INDIVIDUAL_BUSINESS_REPRESENTATIVE" ? "INDIVIDUAL_BUSINESS_REPRESENTATIVE" : "BUSINESS",
      firstName,
      lastName,
      legalName,
      phone: String(raw.phone || ""),
      email: String(raw.email || ""),
      country: String(raw.country || ""),
      city: String(raw.city || ""),
      address: String(raw.address || ""),
      bankName: String(raw.bankName || ""),
      bankCountry: String(raw.bankCountry || ""),
      bankAddress: String(raw.bankAddress || ""),
      accountHolderName: String(raw.accountHolderName || legalName),
      accountNumber: String(raw.accountNumber || ""),
      iban: String(raw.iban || ""),
      swiftBic: String(raw.swiftBic || ""),
      routingNumber: String(raw.routingNumber || ""),
      clabe: String(raw.clabe || ""),
      branchCode: String(raw.branchCode || ""),
      currency: String(raw.currency || "USD").toUpperCase(),
      feePercent: Math.max(0, Number(raw.feePercent || 0)),
      feeFixed: Math.max(0, Number(raw.feeFixed || 0)),
      complianceNote: String(raw.complianceNote || ""),
      createdAt: String(raw.createdAt || new Date().toISOString()),
      updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
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
  const receiverName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.legalName;
  const receiverBlock = [
    `Receiver name: ${receiverName}`,
    r.legalName && r.legalName !== receiverName ? `Legal/business name: ${r.legalName}` : "",
    r.phone ? `Phone: ${r.phone}` : "",
    r.email ? `Email: ${r.email}` : "",
    r.address ? `Address: ${r.address}` : "",
    r.city || r.country ? `Location: ${[r.city, r.country].filter(Boolean).join(", ")}` : "",
  ].filter(Boolean).join("\n");
  if (r.rail === "WESTERN_UNION") return receiverBlock;
  const bankBlock = [
    r.bankName ? `Bank: ${r.bankName}` : "",
    r.bankCountry ? `Bank country: ${r.bankCountry}` : "",
    r.bankAddress ? `Bank address: ${r.bankAddress}` : "",
    r.accountHolderName ? `Account holder: ${r.accountHolderName}` : "",
    r.accountNumber ? `Account number: ${r.accountNumber}` : "",
    r.iban ? `IBAN: ${r.iban}` : "",
    r.swiftBic ? `SWIFT/BIC: ${r.swiftBic}` : "",
    r.routingNumber ? `Routing/ABA: ${r.routingNumber}` : "",
    r.clabe ? `CLABE: ${r.clabe}` : "",
    r.branchCode ? `Branch code: ${r.branchCode}` : "",
  ].filter(Boolean).join("\n");
  return `${receiverBlock}\n\nBANK INFORMATION\n${bankBlock}`;
}
