import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX = "finance.payment.meta.";

export type PaymentCoreMeta = {
  expectedAmount: number | null;
  serviceLabel: string | null;
  providerRef: string | null;
};

export const EMPTY_PAYMENT_META: PaymentCoreMeta = {
  expectedAmount: null,
  serviceLabel: null,
  providerRef: null,
};

export async function getPaymentCoreMeta(paymentId: string): Promise<PaymentCoreMeta> {
  const row = await prisma.appSetting.findUnique({ where: { key: `${PREFIX}${paymentId}` }, select: { value: true } });
  if (!row) return EMPTY_PAYMENT_META;
  try {
    const parsed = JSON.parse(row.value) as Partial<PaymentCoreMeta>;
    return {
      expectedAmount: typeof parsed.expectedAmount === "number" && Number.isFinite(parsed.expectedAmount) ? parsed.expectedAmount : null,
      serviceLabel: typeof parsed.serviceLabel === "string" && parsed.serviceLabel.trim() ? parsed.serviceLabel.trim() : null,
      providerRef: typeof parsed.providerRef === "string" && parsed.providerRef.trim() ? parsed.providerRef.trim() : null,
    };
  } catch {
    return EMPTY_PAYMENT_META;
  }
}

export async function getPaymentCoreMetaMap(paymentIds: string[]) {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  const map = new Map<string, PaymentCoreMeta>();
  if (!ids.length) return map;
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ids.map((id) => `${PREFIX}${id}`) } }, select: { key: true, value: true } });
  for (const row of rows) {
    const id = row.key.slice(PREFIX.length);
    try {
      const parsed = JSON.parse(row.value) as Partial<PaymentCoreMeta>;
      map.set(id, {
        expectedAmount: typeof parsed.expectedAmount === "number" && Number.isFinite(parsed.expectedAmount) ? parsed.expectedAmount : null,
        serviceLabel: typeof parsed.serviceLabel === "string" && parsed.serviceLabel.trim() ? parsed.serviceLabel.trim() : null,
        providerRef: typeof parsed.providerRef === "string" && parsed.providerRef.trim() ? parsed.providerRef.trim() : null,
      });
    } catch {}
  }
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
