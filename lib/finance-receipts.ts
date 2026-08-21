import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export const RECEIPT_META_PREFIX = "finance.receipt.meta.";

export type ReceiptStatus = "ACTIVE" | "VOID";

export type ReceiptMeta = {
  paymentId: string;
  receiptReference: string;
  status: ReceiptStatus;
  issuedAt: string;
  pdfSha256: string | null;
  downloadCount: number;
  lastDownloadedAt: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
  updatedAt: string;
};

function key(paymentId: string) {
  return `${RECEIPT_META_PREFIX}${paymentId}`;
}

function parse(value: string): ReceiptMeta | null {
  try {
    const row = JSON.parse(value) as ReceiptMeta;
    if (!row?.paymentId || !row?.receiptReference) return null;
    return {
      ...row,
      status: row.status === "VOID" ? "VOID" : "ACTIVE",
      pdfSha256: row.pdfSha256 || null,
      downloadCount: Math.max(0, Number(row.downloadCount || 0)),
      lastDownloadedAt: row.lastDownloadedAt || null,
      voidedAt: row.voidedAt || null,
      voidedById: row.voidedById || null,
      voidReason: row.voidReason || null,
    };
  } catch {
    return null;
  }
}

export async function getReceiptMeta(paymentId: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: key(paymentId) }, select: { value: true } });
  return row ? parse(row.value) : null;
}

export async function ensureReceiptMeta(payment: { id: string; reference: string; paidAt: Date | null; createdAt: Date }) {
  const existing = await getReceiptMeta(payment.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const meta: ReceiptMeta = {
    paymentId: payment.id,
    receiptReference: `RCT-${payment.reference}`,
    status: "ACTIVE",
    issuedAt: (payment.paidAt || payment.createdAt).toISOString(),
    pdfSha256: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    voidedAt: null,
    voidedById: null,
    voidReason: null,
    updatedAt: now,
  };
  await prisma.appSetting.upsert({ where: { key: key(payment.id) }, create: { key: key(payment.id), value: JSON.stringify(meta) }, update: {} });
  return (await getReceiptMeta(payment.id)) || meta;
}

export async function recordReceiptPdf(paymentId: string, bytes: Uint8Array) {
  const current = await getReceiptMeta(paymentId);
  if (!current) return null;
  const hash = createHash("sha256").update(bytes).digest("hex");
  const next: ReceiptMeta = {
    ...current,
    pdfSha256: current.pdfSha256 || hash,
    downloadCount: current.downloadCount + 1,
    lastDownloadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await prisma.appSetting.update({ where: { key: key(paymentId) }, data: { value: JSON.stringify(next) } });
  return next;
}

export async function voidReceiptMeta(paymentId: string, userId: string, reason: string) {
  const current = await getReceiptMeta(paymentId);
  if (!current) return null;
  if (current.status === "VOID") return current;
  const now = new Date().toISOString();
  const next: ReceiptMeta = { ...current, status: "VOID", voidedAt: now, voidedById: userId, voidReason: reason, updatedAt: now };
  await prisma.appSetting.update({ where: { key: key(paymentId) }, data: { value: JSON.stringify(next) } });
  return next;
}

export async function getReceiptMetaMap(paymentIds: string[]) {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  const map = new Map<string, ReceiptMeta>();
  if (!ids.length) return map;
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ids.map(key) } }, select: { key: true, value: true } });
  for (const row of rows) {
    const parsed = parse(row.value);
    if (parsed) map.set(parsed.paymentId, parsed);
  }
  return map;
}

export function shortReceiptHash(hash: string | null) {
  return hash ? `${hash.slice(0, 12)}…${hash.slice(-8)}` : "Not generated yet";
}
