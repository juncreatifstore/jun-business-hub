import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX = "finance.payment.meta.";

export type PaymentCoreMeta = {
  expectedAmount: number | null;
  serviceLabel: string | null;
  providerRef: string | null;
  accountId?: string | null;
  accountLabel?: string | null;
  accountDescriptor?: string | null;
  accountMethod?: string | null;
  accountCurrency?: string | null;
  feeAmount?: number | null;
};

export const EMPTY_PAYMENT_META: PaymentCoreMeta = {
  expectedAmount: null, serviceLabel: null, providerRef: null, accountId: null, accountLabel: null, accountDescriptor: null, accountMethod: null, accountCurrency: null, feeAmount: null,
};

function normalize(parsed: Partial<PaymentCoreMeta>): PaymentCoreMeta {
  return {
    expectedAmount: typeof parsed.expectedAmount === "number" && Number.isFinite(parsed.expectedAmount) ? parsed.expectedAmount : null,
    serviceLabel: typeof parsed.serviceLabel === "string" && parsed.serviceLabel.trim() ? parsed.serviceLabel.trim() : null,
    providerRef: typeof parsed.providerRef === "string" && parsed.providerRef.trim() ? parsed.providerRef.trim() : null,
    accountId: typeof parsed.accountId === "string" && parsed.accountId ? parsed.accountId : null,
    accountLabel: typeof parsed.accountLabel === "string" && parsed.accountLabel.trim() ? parsed.accountLabel.trim() : null,
    accountDescriptor: typeof parsed.accountDescriptor === "string" && parsed.accountDescriptor.trim() ? parsed.accountDescriptor.trim() : null,
    accountMethod: typeof parsed.accountMethod === "string" && parsed.accountMethod ? parsed.accountMethod : null,
    accountCurrency: typeof parsed.accountCurrency === "string" && parsed.accountCurrency ? parsed.accountCurrency : null,
    feeAmount: typeof parsed.feeAmount === "number" && Number.isFinite(parsed.feeAmount) ? parsed.feeAmount : null,
  };
}

export async function getPaymentCoreMeta(paymentId: string): Promise<PaymentCoreMeta> {
  const row = await prisma.appSetting.findUnique({ where: { key: `${PREFIX}${paymentId}` }, select: { value: true } });
  if (!row) return EMPTY_PAYMENT_META;
  try { return normalize(JSON.parse(row.value) as Partial<PaymentCoreMeta>); } catch { return EMPTY_PAYMENT_META; }
}

export async function getPaymentCoreMetaMap(paymentIds: string[]) {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  const map = new Map<string, PaymentCoreMeta>();
  if (!ids.length) return map;
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ids.map((id) => `${PREFIX}${id}`) } }, select: { key: true, value: true } });
  for (const row of rows) { const id = row.key.slice(PREFIX.length); try { map.set(id, normalize(JSON.parse(row.value) as Partial<PaymentCoreMeta>)); } catch {} }
  return map;
}

export async function savePaymentCoreMeta(paymentId: string, meta: PaymentCoreMeta) {
  const key = `${PREFIX}${paymentId}`;
  const value = JSON.stringify(meta);
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export function paymentBalance(amountReceived: number, expectedAmount: number | null) {
  if (expectedAmount == null) return null;
  return Math.round((expectedAmount - amountReceived) * 100) / 100;
}
