import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const RECEIPT_PREFIX = "finance.universal.receipt.";

export type UniversalReceiptSource = "COMMISSION" | "PARTNER_WITHDRAWAL" | "REFUND" | "REFUND_PAYOUT" | "EXPENSE" | "MANUAL_TRANSFER" | "PAYMENT";
export type UniversalFinancialReceipt = {
  id: string;
  receiptNumber: string;
  sourceType: UniversalReceiptSource;
  sourceId: string;
  clientId: string | null;
  amount: number;
  currency: string;
  direction: "CREDIT" | "DEBIT";
  title: string;
  description: string;
  status: string;
  method: string;
  transactionReference: string;
  issuedAt: string;
  issuedById: string;
};

function key(id: string) { return `${RECEIPT_PREFIX}${id}`; }
function round(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }
function receiptId(sourceType: UniversalReceiptSource, sourceId: string) {
  return createHash("sha256").update(`${sourceType}:${sourceId}`).digest("hex").slice(0, 24);
}
function receiptNumber(sourceType: UniversalReceiptSource, sourceId: string, issuedAt: Date) {
  const suffix = createHash("sha256").update(`${sourceType}:${sourceId}`).digest("hex").slice(0, 8).toUpperCase();
  return `FRC-${issuedAt.getUTCFullYear()}-${suffix}`;
}

export async function ensureUniversalFinancialReceipt(input: {
  sourceType: UniversalReceiptSource;
  sourceId: string;
  clientId?: string | null;
  amount: number;
  currency: string;
  direction: "CREDIT" | "DEBIT";
  title: string;
  description?: string;
  status: string;
  method?: string;
  transactionReference?: string;
  issuedById: string;
}) {
  const id = receiptId(input.sourceType, input.sourceId);
  const existing = await prisma.appSetting.findUnique({ where: { key: key(id) }, select: { value: true } });
  if (existing) {
    try { return JSON.parse(existing.value) as UniversalFinancialReceipt; } catch {}
  }
  const issuedAt = new Date();
  const receipt: UniversalFinancialReceipt = {
    id,
    receiptNumber: receiptNumber(input.sourceType, input.sourceId, issuedAt),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    clientId: input.clientId ?? null,
    amount: round(Number(input.amount)),
    currency: input.currency.toUpperCase(),
    direction: input.direction,
    title: input.title.slice(0, 160),
    description: String(input.description || "").slice(0, 1000),
    status: input.status.slice(0, 80),
    method: String(input.method || "").slice(0, 120),
    transactionReference: String(input.transactionReference || "").slice(0, 180),
    issuedAt: issuedAt.toISOString(),
    issuedById: input.issuedById,
  };
  await prisma.appSetting.upsert({ where: { key: key(id) }, create: { key: key(id), value: JSON.stringify(receipt) }, update: { value: JSON.stringify(receipt) } });
  return receipt;
}

export async function getUniversalFinancialReceipt(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: key(id) }, select: { value: true } });
  if (!row) return null;
  try { return JSON.parse(row.value) as UniversalFinancialReceipt; } catch { return null; }
}

export async function getUniversalFinancialReceiptForSource(sourceType: UniversalReceiptSource, sourceId: string) {
  return getUniversalFinancialReceipt(receiptId(sourceType, sourceId));
}
