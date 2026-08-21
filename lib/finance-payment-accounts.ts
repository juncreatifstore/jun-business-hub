import "server-only";

import { prisma } from "@/lib/prisma";
import type { PaymentMethod } from "@prisma/client";

export const PAYMENT_ACCOUNT_PREFIX = "finance.payment.account.";

export type FinancePaymentAccount = {
  id: string;
  label: string;
  method: PaymentMethod;
  currency: string;
  receiverName: string;
  accountDescriptor: string;
  feePercent: number;
  feeFixed: number;
  instructions: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function parseAccount(value: string): FinancePaymentAccount | null {
  try {
    const row = JSON.parse(value) as FinancePaymentAccount;
    if (!row?.id || !row.label || !row.method) return null;
    return {
      ...row,
      currency: String(row.currency || "USD").toUpperCase(),
      receiverName: String(row.receiverName || ""),
      accountDescriptor: String(row.accountDescriptor || ""),
      feePercent: Math.max(0, Number(row.feePercent || 0)),
      feeFixed: Math.max(0, Number(row.feeFixed || 0)),
      instructions: String(row.instructions || ""),
      enabled: row.enabled !== false,
    };
  } catch { return null; }
}

export async function getFinancePaymentAccounts(options?: { enabledOnly?: boolean }) {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: PAYMENT_ACCOUNT_PREFIX } },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  });
  const accounts = rows.map((r) => parseAccount(r.value)).filter((v): v is FinancePaymentAccount => Boolean(v));
  return options?.enabledOnly ? accounts.filter((a) => a.enabled) : accounts;
}

export async function getFinancePaymentAccount(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${PAYMENT_ACCOUNT_PREFIX}${id}` }, select: { value: true } });
  return row ? parseAccount(row.value) : null;
}

export function calculatePaymentFee(amount: number, account?: FinancePaymentAccount | null) {
  if (!account) return 0;
  return Math.round((account.feeFixed + amount * (account.feePercent / 100)) * 100) / 100;
}
