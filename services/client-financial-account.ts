"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getClientAccountProfile, getClientFinancialAccount, makeClientCommission, saveClientAccountProfile, saveClientCommission, type ClientStatementLanguage } from "@/lib/client-financial-account";

function text(v: FormDataEntryValue | null, max = 3000) { return String(v || "").trim().slice(0, max); }
function money(v: FormDataEntryValue | null) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; }

export async function updateClientFinancialProfile(clientId: string, formData: FormData) {
  const user = await assertPermission("CLIENT_UPDATE");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } });
  if (!client) throw new Error("Client not found");
  const before = await getClientAccountProfile(clientId);
  const preferredLanguage = text(formData.get("preferredLanguage"), 2).toUpperCase() as ClientStatementLanguage;
  if (!["FR", "EN", "ES", "HT"].includes(preferredLanguage)) throw new Error("Unsupported statement language");
  const isPartner = formData.get("isPartner") === "on" || formData.get("isPartner") === "true";
  const next = {
    ...before,
    preferredLanguage,
    isPartner,
    partnerSince: isPartner ? (before.partnerSince || new Date().toISOString()) : null,
    partnerNote: text(formData.get("partnerNote"), 2000),
    updatedAt: new Date().toISOString(),
    updatedById: user.id,
  };
  await saveClientAccountProfile(next);
  await audit({ userId: user.id, action: "CLIENT_FINANCIAL_PROFILE_UPDATE", resourceType: "Client", resourceId: clientId, before: { preferredLanguage: before.preferredLanguage, isPartner: before.isPartner }, after: { preferredLanguage, isPartner, partnerNote: next.partnerNote } });
  await logActivity({ type: "CLIENT_ACCOUNT_UPDATED", message: `Financial account settings updated for ${client.firstName} ${client.lastName}`, userId: user.id, clientId });
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/account`);
  revalidatePath(`/app/clients/${clientId}/statement`);
}

export async function addPartnerCommission(clientId: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_CREATE");
  const [client, profile] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } }),
    getClientAccountProfile(clientId),
  ]);
  if (!client) throw new Error("Client not found");
  if (!profile.isPartner) throw new Error("Enable Partner status before crediting a commission");
  const amount = money(formData.get("amount"));
  const currency = text(formData.get("currency"), 3).toUpperCase();
  const description = text(formData.get("description"), 500);
  const sourceReference = text(formData.get("sourceReference"), 160);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Commission amount must be positive");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
  if (!description) throw new Error("Commission description is required");
  const entry = makeClientCommission({ clientId, amount, currency, description, sourceReference, createdById: user.id });
  await saveClientCommission(entry);
  await audit({ userId: user.id, action: "CLIENT_COMMISSION_CREDIT", resourceType: "ClientCommission", resourceId: entry.id, after: { clientId, amount, currency, description, sourceReference } });
  await logActivity({ type: "CLIENT_COMMISSION_CREDIT", message: `${currency} ${amount.toFixed(2)} commission credited to ${client.firstName} ${client.lastName}`, userId: user.id, clientId });
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/account`);
  revalidatePath(`/app/clients/${clientId}/statement`);
  revalidatePath("/app/finance");
}

export async function voidPartnerCommission(clientId: string, commissionId: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_APPROVE");
  const account = await getClientFinancialAccount(clientId);
  const current = account.commissions.find((c) => c.id === commissionId);
  if (!current || current.status !== "CREDITED") throw new Error("Commission not found or already voided");
  const reason = text(formData.get("reason"), 1000);
  if (!reason) throw new Error("A reason is required");
  const next = { ...current, status: "VOID" as const, voidedAt: new Date().toISOString(), voidedById: user.id, voidReason: reason };
  await saveClientCommission(next);
  await audit({ userId: user.id, action: "CLIENT_COMMISSION_VOID", resourceType: "ClientCommission", resourceId: commissionId, before: { status: current.status, amount: current.amount, currency: current.currency }, after: { status: "VOID", reason } });
  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath(`/app/clients/${clientId}/account`);
  revalidatePath(`/app/clients/${clientId}/statement`);
}

export async function openClientStatement(clientId: string) {
  await assertPermission("CLIENT_READ");
  redirect(`/app/clients/${clientId}/statement`);
}
