import "server-only";

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap, netPaymentAmount } from "@/lib/finance-payment-core";
import { expenseEffectiveStatus, listFinanceExpenses } from "@/lib/finance-expenses";

const PROFILE_PREFIX = "client.account.profile.";
const COMMISSION_PREFIX = "client.account.commission.";
const WITHDRAWAL_PREFIX = "client.account.withdrawal.";

export type ClientStatementLanguage = "FR" | "EN" | "ES" | "HT";
export type ClientAccountProfile = { clientId:string; preferredLanguage:ClientStatementLanguage; isPartner:boolean; partnerSince:string|null; partnerNote:string; updatedAt:string; updatedById:string|null };
export type ClientCommission = { id:string; clientId:string; amount:number; currency:string; description:string; sourceReference:string; status:"CREDITED"|"VOID"; createdById:string; createdAt:string; voidedAt:string|null; voidedById:string|null; voidReason:string };
export type ClientWithdrawal = { id:string; clientId:string; amount:number; currency:string; method:string; transactionReference:string; description:string; receiverId:string|null; status:"PAID"|"VOID"; createdById:string; createdAt:string; voidedAt:string|null; voidedById:string|null; voidReason:string };
export type ClientAccountEntry = { id:string; date:Date; type:"PAYMENT"|"REFUND"|"COMMISSION"|"WITHDRAWAL"|"EXPENSE"; reference:string; description:string; status:string; currency:string; credit:number; debit:number; sourceHref:string|null };
export type ClientCurrencyBalance = { currency:string; confirmedFunds:number; commissions:number; committedExpenses:number; activeRefunds:number; pendingRefunds:number; refundsPaid:number; partnerWithdrawals:number; available:number };

function round(v:number){ return Math.round((v + Number.EPSILON) * 100) / 100; }
function profileKey(clientId:string){ return `${PROFILE_PREFIX}${clientId}`; }
function commissionKey(id:string){ return `${COMMISSION_PREFIX}${id}`; }
function withdrawalKey(id:string){ return `${WITHDRAWAL_PREFIX}${id}`; }

export async function getClientAccountProfile(clientId:string):Promise<ClientAccountProfile>{
  const row=await prisma.appSetting.findUnique({where:{key:profileKey(clientId)},select:{value:true}});
  if(row){try{const p=JSON.parse(row.value) as Partial<ClientAccountProfile>;return{clientId,preferredLanguage:["FR","EN","ES","HT"].includes(String(p.preferredLanguage))?p.preferredLanguage as ClientStatementLanguage:"FR",isPartner:Boolean(p.isPartner),partnerSince:p.partnerSince||null,partnerNote:String(p.partnerNote||""),updatedAt:String(p.updatedAt||new Date(0).toISOString()),updatedById:p.updatedById||null};}catch{}}
  return{clientId,preferredLanguage:"FR",isPartner:false,partnerSince:null,partnerNote:"",updatedAt:new Date(0).toISOString(),updatedById:null};
}
export async function saveClientAccountProfile(profile:ClientAccountProfile){await prisma.appSetting.upsert({where:{key:profileKey(profile.clientId)},create:{key:profileKey(profile.clientId),value:JSON.stringify(profile)},update:{value:JSON.stringify(profile)}});return profile;}
function parseCommission(value:string):ClientCommission|null{try{const c=JSON.parse(value) as ClientCommission;if(!c?.id||!c.clientId||!Number.isFinite(Number(c.amount))||!c.currency)return null;return{...c,amount:round(Number(c.amount)),currency:c.currency.toUpperCase()};}catch{return null;}}
function parseWithdrawal(value:string):ClientWithdrawal|null{try{const w=JSON.parse(value) as ClientWithdrawal;if(!w?.id||!w.clientId||!Number.isFinite(Number(w.amount))||!w.currency)return null;return{...w,amount:round(Number(w.amount)),currency:w.currency.toUpperCase()};}catch{return null;}}
export async function listClientCommissions(clientId:string){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:COMMISSION_PREFIX},value:{contains:`\"clientId\":\"${clientId}\"`}},orderBy:{updatedAt:"desc"},take:1000,select:{value:true}});return rows.map(r=>parseCommission(r.value)).filter((v):v is ClientCommission=>Boolean(v&&v.clientId===clientId));}
export async function listClientWithdrawals(clientId:string){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:WITHDRAWAL_PREFIX},value:{contains:`\"clientId\":\"${clientId}\"`}},orderBy:{updatedAt:"desc"},take:1000,select:{value:true}});return rows.map(r=>parseWithdrawal(r.value)).filter((v):v is ClientWithdrawal=>Boolean(v&&v.clientId===clientId));}
export async function saveClientCommission(entry:ClientCommission){await prisma.appSetting.upsert({where:{key:commissionKey(entry.id)},create:{key:commissionKey(entry.id),value:JSON.stringify(entry)},update:{value:JSON.stringify(entry)}});return entry;}
export async function saveClientWithdrawal(entry:ClientWithdrawal){await prisma.appSetting.upsert({where:{key:withdrawalKey(entry.id)},create:{key:withdrawalKey(entry.id),value:JSON.stringify(entry)},update:{value:JSON.stringify(entry)}});return entry;}
export function makeClientCommission(input:Omit<ClientCommission,"id"|"createdAt"|"status"|"voidedAt"|"voidedById"|"voidReason">):ClientCommission{return{...input,id:randomUUID(),amount:round(input.amount),currency:input.currency.toUpperCase(),status:"CREDITED",createdAt:new Date().toISOString(),voidedAt:null,voidedById:null,voidReason:""};}
export function makeClientWithdrawal(input:Omit<ClientWithdrawal,"id"|"createdAt"|"status"|"voidedAt"|"voidedById"|"voidReason">):ClientWithdrawal{return{...input,id:randomUUID(),amount:round(input.amount),currency:input.currency.toUpperCase(),status:"PAID",createdAt:new Date().toISOString(),voidedAt:null,voidedById:null,voidReason:""};}

export async function getClientFinancialAccount(clientId:string){
  const [payments,refunds,commissions,withdrawals,profile,allExpenses]=await Promise.all([
    prisma.payment.findMany({where:{clientId},orderBy:{createdAt:"asc"},select:{id:true,reference:true,amount:true,currency:true,status:true,paidAt:true,createdAt:true,notes:true}}),
    prisma.refund.findMany({where:{clientId},orderBy:{createdAt:"asc"},include:{installments:{select:{amount:true,status:true}}}}),
    listClientCommissions(clientId),listClientWithdrawals(clientId),getClientAccountProfile(clientId),listFinanceExpenses(5000),
  ]);
  const expenses=allExpenses.filter(e=>e.clientId===clientId);
  const paymentMeta=await getPaymentCoreMetaMap(payments.map(p=>p.id));
  const balances=new Map<string,ClientCurrencyBalance>();const entries:ClientAccountEntry[]=[];
  const bucket=(currency:string)=>{const key=currency.toUpperCase();const current=balances.get(key)||{currency:key,confirmedFunds:0,commissions:0,committedExpenses:0,activeRefunds:0,pendingRefunds:0,refundsPaid:0,partnerWithdrawals:0,available:0};balances.set(key,current);return current;};
  for(const p of payments){
    if(!["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"].includes(p.status))continue;
    const meta=paymentMeta.get(p.id);const gross=round(Number(p.amount));const fee=round(Number(meta?.feeAmount||0));const amount=netPaymentAmount(gross,fee);const b=bucket(p.currency);b.confirmedFunds=round(b.confirmedFunds+amount);
    const feeText=fee>0?` · gross ${p.currency.toUpperCase()} ${gross.toFixed(2)} · fee ${p.currency.toUpperCase()} ${fee.toFixed(2)}`:"";
    entries.push({id:`payment:${p.id}`,date:p.paidAt||p.createdAt,type:"PAYMENT",reference:p.reference,description:`${p.notes||"Funds received"}${feeText}`,status:p.status,currency:p.currency.toUpperCase(),credit:amount,debit:0,sourceHref:`/app/finance/payments/${p.id}`});
  }
  for(const e of expenses){
    const status=expenseEffectiveStatus(e);if(!["APPROVED","PARTIALLY_PAID","PAID"].includes(status))continue;
    const amount=round(Number(e.amount));const currency=e.currency.toUpperCase();const b=bucket(currency);b.committedExpenses=round(b.committedExpenses+amount);
    const details=[e.vendorName,e.category.replaceAll("_"," "),e.description,e.invoiceNumber?`Vendor invoice ${e.invoiceNumber}`:""].filter(Boolean).join(" · ");
    entries.push({id:`expense:${e.id}`,date:new Date(e.updatedAt||e.createdAt),type:"EXPENSE",reference:e.expenseNumber,description:details,status,currency,credit:0,debit:amount,sourceHref:`/app/finance/expenses/${e.id}`});
  }
  for(const c of commissions){if(c.status!=="CREDITED")continue;const b=bucket(c.currency);b.commissions=round(b.commissions+c.amount);entries.push({id:`commission:${c.id}`,date:new Date(c.createdAt),type:"COMMISSION",reference:c.sourceReference||`COM-${c.id.slice(0,8).toUpperCase()}`,description:c.description||"Partner commission",status:c.status,currency:c.currency,credit:c.amount,debit:0,sourceHref:null});}
  for(const w of withdrawals){if(w.status!=="PAID")continue;const b=bucket(w.currency);b.partnerWithdrawals=round(b.partnerWithdrawals+w.amount);entries.push({id:`withdrawal:${w.id}`,date:new Date(w.createdAt),type:"WITHDRAWAL",reference:w.transactionReference||`WDR-${w.id.slice(0,8).toUpperCase()}`,description:w.description||"Partner withdrawal",status:w.status,currency:w.currency,credit:0,debit:w.amount,sourceHref:null});}
  for(const r of refunds){const currency=r.currency.toUpperCase();const amount=round(Number(r.amount));const paid=round(r.installments.filter(i=>i.status==="PAID").reduce((sum,i)=>sum+Number(i.amount),0));const b=bucket(currency);b.refundsPaid=round(b.refundsPaid+paid);if(["REQUESTED","UNDER_REVIEW"].includes(r.status))b.pendingRefunds=round(b.pendingRefunds+amount);if(["APPROVED","PARTIALLY_PAID","PAID"].includes(r.status)){b.activeRefunds=round(b.activeRefunds+amount);entries.push({id:`refund:${r.id}`,date:r.createdAt,type:"REFUND",reference:r.refundNumber,description:r.reason,status:r.status,currency,credit:0,debit:amount,sourceHref:`/app/finance/refunds/${r.id}`});}}
  for(const b of balances.values())b.available=round(b.confirmedFunds+b.commissions-b.committedExpenses-b.activeRefunds-b.partnerWithdrawals);
  entries.sort((a,b)=>a.date.getTime()-b.date.getTime());const running=new Map<string,number>();const statementEntries=entries.map(entry=>{const next=round((running.get(entry.currency)||0)+entry.credit-entry.debit);running.set(entry.currency,next);return{...entry,runningBalance:next};});
  return{profile,commissions,withdrawals,expenses,balances:[...balances.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),entries:statementEntries};
}
export async function getClientAvailableBalance(clientId:string,currency:string){const account=await getClientFinancialAccount(clientId);return account.balances.find(b=>b.currency===currency.toUpperCase())?.available??0;}
export function formatClientBalances(rows:Array<{currency:string;available:number}>,formatter:(amount:number,currency:string)=>string){if(!rows.length)return formatter(0,"USD");return rows.map(r=>formatter(r.available,r.currency)).join(" · ");}
