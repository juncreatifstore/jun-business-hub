"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PAYMENT_ACCOUNT_PREFIX, getFinancePaymentAccount, type FinancePaymentAccount } from "@/lib/finance-payment-accounts";
import type { PaymentMethod } from "@prisma/client";

const METHODS = new Set(["ZELLE","STRIPE","PAYPAL","MERCADO_PAGO","BANK_TRANSFER","CASH","MONCASH","OTHER"]);

function destination(message: string, error = false) {
  return `/app/finance/accounts?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}`;
}

export async function createFinancePaymentAccount(formData: FormData) {
  const user = await assertPermission("SETTINGS_MANAGE");
  const methodRaw = String(formData.get("method") || "OTHER");
  const method = (METHODS.has(methodRaw) ? methodRaw : "OTHER") as PaymentMethod;
  const label = String(formData.get("label") || "").trim().slice(0, 120);
  const currency = String(formData.get("currency") || "USD").trim().toUpperCase().slice(0, 3);
  const receiverName = String(formData.get("receiverName") || "").trim().slice(0, 160);
  const accountDescriptor = String(formData.get("accountDescriptor") || "").trim().slice(0, 240);
  const instructions = String(formData.get("instructions") || "").trim().slice(0, 2000);
  const feePercent = Math.max(0, Math.min(100, Number(formData.get("feePercent") || 0)));
  const feeFixed = Math.max(0, Number(formData.get("feeFixed") || 0));
  if (!label) redirect(destination("Account label is required", true));
  if (currency.length !== 3) redirect(destination("Currency must have 3 letters", true));

  const id = randomUUID();
  const now = new Date().toISOString();
  const account: FinancePaymentAccount = { id, label, method, currency, receiverName, accountDescriptor, feePercent, feeFixed, instructions, enabled: true, createdAt: now, updatedAt: now };
  await prisma.appSetting.create({ data: { key: `${PAYMENT_ACCOUNT_PREFIX}${id}`, value: JSON.stringify(account) } });
  await audit({ userId: user.id, action: "PAYMENT_ACCOUNT_CREATE", resourceType: "FinancePaymentAccount", resourceId: id, after: { label, method, currency, receiverName, accountDescriptor, feePercent, feeFixed } });
  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/payments/new");
  redirect(destination("Payment account created"));
}

export async function toggleFinancePaymentAccount(id: string) {
  const user = await assertPermission("SETTINGS_MANAGE");
  const account = await getFinancePaymentAccount(id);
  if (!account) return;
  const next = { ...account, enabled: !account.enabled, updatedAt: new Date().toISOString() };
  await prisma.appSetting.update({ where: { key: `${PAYMENT_ACCOUNT_PREFIX}${id}` }, data: { value: JSON.stringify(next) } });
  await audit({ userId: user.id, action: next.enabled ? "PAYMENT_ACCOUNT_ENABLE" : "PAYMENT_ACCOUNT_DISABLE", resourceType: "FinancePaymentAccount", resourceId: id, before: { enabled: account.enabled }, after: { enabled: next.enabled } });
  revalidatePath("/app/finance/accounts");
  revalidatePath("/app/finance/payments/new");
}

export async function updateFinancePaymentAccount(id: string, formData: FormData) {
  const user = await assertPermission("SETTINGS_MANAGE");
  const account = await getFinancePaymentAccount(id);
  if (!account) redirect(destination("Payment account not found", true));
  const label = String(formData.get("label") || account.label).trim().slice(0, 120);
  const receiverName = String(formData.get("receiverName") || "").trim().slice(0, 160);
  const accountDescriptor = String(formData.get("accountDescriptor") || "").trim().slice(0, 240);
  const instructions = String(formData.get("instructions") || "").trim().slice(0, 2000);
  const feePercent = Math.max(0, Math.min(100, Number(formData.get("feePercent") || 0)));
  const feeFixed = Math.max(0, Number(formData.get("feeFixed") || 0));
  const next = { ...account, label, receiverName, accountDescriptor, instructions, feePercent, feeFixed, updatedAt: new Date().toISOString() };
  await prisma.appSetting.update({ where: { key: `${PAYMENT_ACCOUNT_PREFIX}${id}` }, data: { value: JSON.stringify(next) } });
  await audit({ userId: user.id, action: "PAYMENT_ACCOUNT_UPDATE", resourceType: "FinancePaymentAccount", resourceId: id, before: account, after: next });
  revalidatePath("/app/finance/accounts");
  redirect(destination("Payment account updated"));
}
