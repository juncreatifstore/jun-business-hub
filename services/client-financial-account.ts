"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getClientAccountProfile, getClientFinancialAccount, makeClientCommission, makeClientWithdrawal, saveClientAccountProfile, saveClientCommission, saveClientWithdrawal, type ClientStatementLanguage } from "@/lib/client-financial-account";
import { ensureUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";

function text(v: FormDataEntryValue | null, max = 3000) { return String(v || "").trim().slice(0, max); }
function money(v: FormDataEntryValue | null) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
function refresh(clientId:string){revalidatePath(`/app/clients/${clientId}`);revalidatePath(`/app/clients/${clientId}/account`);revalidatePath(`/app/clients/${clientId}/statement`);revalidatePath("/app/finance");}

export async function updateClientFinancialProfile(clientId: string, formData: FormData) {
  const user = await assertPermission("CLIENT_UPDATE");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } });
  if (!client) throw new Error("Client not found");
  const before = await getClientAccountProfile(clientId);
  const preferredLanguage = text(formData.get("preferredLanguage"), 2).toUpperCase() as ClientStatementLanguage;
  if (!["FR", "EN", "ES", "HT"].includes(preferredLanguage)) throw new Error("Unsupported statement language");
  const isPartner = formData.get("isPartner") === "on" || formData.get("isPartner") === "true";
  const next = { ...before, preferredLanguage, isPartner, partnerSince: isPartner ? (before.partnerSince || new Date().toISOString()) : null, partnerNote: text(formData.get("partnerNote"), 2000), updatedAt: new Date().toISOString(), updatedById: user.id };
  await saveClientAccountProfile(next);
  await audit({ userId: user.id, action: "CLIENT_FINANCIAL_PROFILE_UPDATE", resourceType: "Client", resourceId: clientId, before: { preferredLanguage: before.preferredLanguage, isPartner: before.isPartner }, after: { preferredLanguage, isPartner, partnerNote: next.partnerNote } });
  await logActivity({ type: "CLIENT_ACCOUNT_UPDATED", message: `Financial account settings updated for ${client.firstName} ${client.lastName}`, userId: user.id, clientId });
  refresh(clientId);
}

export async function addPartnerCommission(clientId: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_CREATE");
  const [client, profile] = await Promise.all([prisma.client.findUnique({ where: { id: clientId }, select: { id: true, firstName: true, lastName: true } }), getClientAccountProfile(clientId)]);
  if (!client) throw new Error("Client not found");
  if (!profile.isPartner) throw new Error("Enable Partner status before crediting a commission");
  const amount = money(formData.get("amount")); const currency = text(formData.get("currency"), 3).toUpperCase(); const description = text(formData.get("description"), 500); const sourceReference = text(formData.get("sourceReference"), 160);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Commission amount must be positive");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency"); if (!description) throw new Error("Commission description is required");
  const entry = makeClientCommission({ clientId, amount, currency, description, sourceReference, createdById: user.id });
  await saveClientCommission(entry);
  await ensureUniversalFinancialReceipt({sourceType:"COMMISSION",sourceId:entry.id,clientId,amount,currency,direction:"CREDIT",title:"Partner commission receipt",description,status:"CREDITED",transactionReference:sourceReference,issuedById:user.id});
  await audit({ userId: user.id, action: "CLIENT_COMMISSION_CREDIT", resourceType: "ClientCommission", resourceId: entry.id, after: { clientId, amount, currency, description, sourceReference } });
  await logActivity({ type: "CLIENT_COMMISSION_CREDIT", message: `${currency} ${amount.toFixed(2)} commission credited to ${client.firstName} ${client.lastName}`, userId: user.id, clientId });
  refresh(clientId);
}

export async function recordPartnerWithdrawal(clientId:string, formData:FormData){
  const user=await assertPermission("PAYMENT_APPROVE");
  const [client,account]=await Promise.all([prisma.client.findUnique({where:{id:clientId},select:{id:true,firstName:true,lastName:true}}),getClientFinancialAccount(clientId)]);
  if(!client) throw new Error("Client not found"); if(!account.profile.isPartner) throw new Error("Partner status is required for a partner withdrawal");
  const amount=money(formData.get("amount")); const currency=text(formData.get("currency"),3).toUpperCase(); const method=text(formData.get("method"),100); const transactionReference=text(formData.get("transactionReference"),180); const description=text(formData.get("description"),500)||"Partner withdrawal"; const receiverId=text(formData.get("receiverId"),100)||null;
  if(!Number.isFinite(amount)||amount<=0) throw new Error("Withdrawal amount must be positive"); if(!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency"); if(!method||!transactionReference) throw new Error("Method and transaction reference are required");
  const available=account.balances.find(b=>b.currency===currency)?.available??0; if(amount>available+0.005) throw new Error(`Withdrawal exceeds available balance: ${currency} ${available.toFixed(2)} available.`);
  const entry=makeClientWithdrawal({clientId,amount,currency,method,transactionReference,description,receiverId,createdById:user.id}); await saveClientWithdrawal(entry);
  const receipt=await ensureUniversalFinancialReceipt({sourceType:"PARTNER_WITHDRAWAL",sourceId:entry.id,clientId,amount,currency,direction:"DEBIT",title:"Partner withdrawal receipt",description,status:"PAID",method,transactionReference,issuedById:user.id});
  await audit({userId:user.id,action:"CLIENT_PARTNER_WITHDRAWAL",resourceType:"ClientWithdrawal",resourceId:entry.id,after:{clientId,amount,currency,method,transactionReference,receiverId,receiptNumber:receipt.receiptNumber}});
  await logActivity({type:"CLIENT_PARTNER_WITHDRAWAL",message:`${currency} ${amount.toFixed(2)} partner withdrawal paid to ${client.firstName} ${client.lastName}`,userId:user.id,clientId}); refresh(clientId);
}

export async function voidPartnerWithdrawal(clientId:string,withdrawalId:string,formData:FormData){
  const user=await assertPermission("PAYMENT_APPROVE"); const account=await getClientFinancialAccount(clientId); const current=account.withdrawals.find(w=>w.id===withdrawalId); if(!current||current.status!=="PAID") throw new Error("Withdrawal not found or already voided");
  const reason=text(formData.get("reason"),1000); if(!reason) throw new Error("A correction reason is required"); const next={...current,status:"VOID" as const,voidedAt:new Date().toISOString(),voidedById:user.id,voidReason:reason}; await saveClientWithdrawal(next);
  await audit({userId:user.id,action:"CLIENT_PARTNER_WITHDRAWAL_VOID",resourceType:"ClientWithdrawal",resourceId:withdrawalId,before:{status:current.status,amount:current.amount,currency:current.currency},after:{status:"VOID",reason}}); refresh(clientId);
}

export async function voidPartnerCommission(clientId: string, commissionId: string, formData: FormData) {
  const user = await assertPermission("PAYMENT_APPROVE"); const account = await getClientFinancialAccount(clientId); const current = account.commissions.find((c) => c.id === commissionId);
  if (!current || current.status !== "CREDITED") throw new Error("Commission not found or already voided"); const reason = text(formData.get("reason"), 1000); if (!reason) throw new Error("A reason is required");
  const next = { ...current, status: "VOID" as const, voidedAt: new Date().toISOString(), voidedById: user.id, voidReason: reason }; await saveClientCommission(next);
  await audit({ userId: user.id, action: "CLIENT_COMMISSION_VOID", resourceType: "ClientCommission", resourceId: commissionId, before: { status: current.status, amount: current.amount, currency: current.currency }, after: { status: "VOID", reason } }); refresh(clientId);
}

export async function openClientStatement(clientId: string) { await assertPermission("CLIENT_READ"); redirect(`/app/clients/${clientId}/statement`); }
