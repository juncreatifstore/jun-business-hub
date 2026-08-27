import "server-only";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { getFinancePaymentAccounts } from "@/lib/finance-payment-accounts";
import { listFinanceExpenses } from "@/lib/finance-expenses";
import { getTreasuryStore } from "@/lib/company-funds";

const SETTINGS_KEY = "company.funds.finance-sync.settings";
const STATE_KEY = "company.funds.finance-sync.state";

export type FinanceTreasuryMapping = { financeAccountId: string; treasuryAccountId: string };
export type FinanceSyncSettings = {
  mappings: FinanceTreasuryMapping[];
  outgoingAccountByCurrency: Record<string,string>;
};
export type ConsolidatedFinanceEntry = {
  id: string;
  sourceType: "PAYMENT"|"PAYMENT_FEE"|"REFUND"|"EXPENSE";
  sourceId: string;
  reference: string;
  caseId: string|null;
  clientId: string|null;
  direction: "IN"|"OUT";
  amount: number;
  currency: string;
  occurredAt: string;
  category: string;
  treasuryAccountId: string|null;
};
export type FinanceSyncState = { lastSyncedAt: string|null; entryCount: number; checksum: string };

function round(v:number){ return Math.round((v+Number.EPSILON)*100)/100; }
function emptySettings():FinanceSyncSettings{return{mappings:[],outgoingAccountByCurrency:{}}}
async function readSettings(){const row=await prisma.appSetting.findUnique({where:{key:SETTINGS_KEY},select:{value:true}});if(!row)return emptySettings();try{const p=JSON.parse(row.value) as Partial<FinanceSyncSettings>;return{mappings:Array.isArray(p.mappings)?p.mappings:[],outgoingAccountByCurrency:p.outgoingAccountByCurrency&&typeof p.outgoingAccountByCurrency==="object"?p.outgoingAccountByCurrency:{}}}catch{return emptySettings()}}
export async function getFinanceSyncSettings(){return readSettings()}
export async function saveFinanceSyncSettings(settings:FinanceSyncSettings){await prisma.appSetting.upsert({where:{key:SETTINGS_KEY},create:{key:SETTINGS_KEY,value:JSON.stringify(settings)},update:{value:JSON.stringify(settings)}});return settings}
export async function setFinanceTreasuryMapping(financeAccountId:string,treasuryAccountId:string|null){const s=await readSettings();s.mappings=s.mappings.filter(m=>m.financeAccountId!==financeAccountId);if(treasuryAccountId)s.mappings.push({financeAccountId,treasuryAccountId});return saveFinanceSyncSettings(s)}
export async function setOutgoingTreasuryAccount(currency:string,treasuryAccountId:string|null){const s=await readSettings();const c=currency.toUpperCase();if(treasuryAccountId)s.outgoingAccountByCurrency[c]=treasuryAccountId;else delete s.outgoingAccountByCurrency[c];return saveFinanceSyncSettings(s)}

export async function buildCompanyFinanceEntries(){
  const [payments,refunds,expenses,settings,treasury]=await Promise.all([
    prisma.payment.findMany({where:{status:{in:["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}},select:{id:true,reference:true,clientId:true,caseId:true,amount:true,currency:true,paidAt:true,status:true},orderBy:{paidAt:"asc"}}),
    prisma.refund.findMany({where:{status:{in:["PARTIALLY_PAID","PAID"]}},select:{id:true,refundNumber:true,clientId:true,caseId:true,currency:true,installments:{where:{status:"PAID"},select:{id:true,amount:true,paidAt:true}}}}),
    listFinanceExpenses(5000),readSettings(),getTreasuryStore()
  ]);
  const paymentMeta=await getPaymentCoreMetaMap(payments.map(p=>p.id));
  const mapping=new Map(settings.mappings.map(m=>[m.financeAccountId,m.treasuryAccountId]));
  const validTreasuryIds=new Set(treasury.accounts.map(a=>a.id));
  const entries:ConsolidatedFinanceEntry[]=[];
  for(const p of payments){
    const meta=paymentMeta.get(p.id);const treasuryAccountId=meta?.accountId?mapping.get(meta.accountId)||null:null;
    entries.push({id:`PAYMENT:${p.id}`,sourceType:"PAYMENT",sourceId:p.id,reference:p.reference,caseId:p.caseId,clientId:p.clientId,direction:"IN",amount:round(Number(p.amount)),currency:p.currency.toUpperCase(),occurredAt:p.paidAt.toISOString(),category:"CLIENT_PAYMENT",treasuryAccountId:treasuryAccountId&&validTreasuryIds.has(treasuryAccountId)?treasuryAccountId:null});
    const fee=round(Number(meta?.feeAmount||0));if(fee>0)entries.push({id:`PAYMENT_FEE:${p.id}`,sourceType:"PAYMENT_FEE",sourceId:p.id,reference:p.reference,caseId:p.caseId,clientId:p.clientId,direction:"OUT",amount:fee,currency:p.currency.toUpperCase(),occurredAt:p.paidAt.toISOString(),category:"PAYMENT_FEE",treasuryAccountId:treasuryAccountId&&validTreasuryIds.has(treasuryAccountId)?treasuryAccountId:null});
  }
  for(const r of refunds)for(const i of r.installments){const c=r.currency.toUpperCase();const out=settings.outgoingAccountByCurrency[c]||null;entries.push({id:`REFUND:${i.id}`,sourceType:"REFUND",sourceId:i.id,reference:r.refundNumber,caseId:r.caseId,clientId:r.clientId,direction:"OUT",amount:round(Number(i.amount)),currency:c,occurredAt:(i.paidAt||new Date()).toISOString(),category:"REFUND",treasuryAccountId:out&&validTreasuryIds.has(out)?out:null})}
  for(const e of expenses)for(const p of e.payments){const c=e.currency.toUpperCase();const out=settings.outgoingAccountByCurrency[c]||null;entries.push({id:`EXPENSE:${p.id}`,sourceType:"EXPENSE",sourceId:p.id,reference:e.expenseNumber,caseId:e.caseId,clientId:e.clientId,direction:"OUT",amount:round(Number(p.amount)),currency:c,occurredAt:p.paidAt,category:e.category,treasuryAccountId:out&&validTreasuryIds.has(out)?out:null})}
  return entries.sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime());
}

export async function getCompanyFinanceConsolidation(){
  const [entries,financeAccounts,treasury,settings,stateRow]=await Promise.all([buildCompanyFinanceEntries(),getFinancePaymentAccounts(),getTreasuryStore(),readSettings(),prisma.appSetting.findUnique({where:{key:STATE_KEY},select:{value:true}})]);
  const currencies=[...new Set(entries.map(e=>e.currency))].sort();
  const byCurrency=currencies.map(currency=>{const rows=entries.filter(e=>e.currency===currency);const received=round(rows.filter(e=>e.sourceType==="PAYMENT").reduce((s,e)=>s+e.amount,0));const refunds=round(rows.filter(e=>e.sourceType==="REFUND").reduce((s,e)=>s+e.amount,0));const expenses=round(rows.filter(e=>e.sourceType==="EXPENSE").reduce((s,e)=>s+e.amount,0));const fees=round(rows.filter(e=>e.sourceType==="PAYMENT_FEE").reduce((s,e)=>s+e.amount,0));return{currency,received,refunds,expenses,fees,net:round(received-refunds-expenses-fees),entryCount:rows.length}});
  const projects=treasury.integrations.map(project=>{const rows=project.caseId?entries.filter(e=>e.caseId===project.caseId&&e.currency===project.currency):[];const income=round(rows.filter(e=>e.direction==="IN").reduce((s,e)=>s+e.amount,0));const out=round(rows.filter(e=>e.direction==="OUT").reduce((s,e)=>s+e.amount,0));return{id:project.id,code:project.code,name:project.name,currency:project.currency,caseId:project.caseId,income,out,profit:round(income-out),entryCount:rows.length}});
  let state:FinanceSyncState={lastSyncedAt:null,entryCount:0,checksum:""};if(stateRow)try{state=JSON.parse(stateRow.value) as FinanceSyncState}catch{}
  return{entries,byCurrency,projects,financeAccounts,treasuryAccounts:treasury.accounts,settings,state,unmappedFinanceAccounts:financeAccounts.filter(a=>!settings.mappings.some(m=>m.financeAccountId===a.id)),unmappedEntries:entries.filter(e=>!e.treasuryAccountId).length};
}

export async function syncCompanyFinanceState(){const entries=await buildCompanyFinanceEntries();const checksum=entries.map(e=>`${e.id}:${e.amount}:${e.currency}:${e.treasuryAccountId||"-"}`).join("|");const state:FinanceSyncState={lastSyncedAt:new Date().toISOString(),entryCount:entries.length,checksum};await prisma.appSetting.upsert({where:{key:STATE_KEY},create:{key:STATE_KEY,value:JSON.stringify(state)},update:{value:JSON.stringify(state)}});return state}
