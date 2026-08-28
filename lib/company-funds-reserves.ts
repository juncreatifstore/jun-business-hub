import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTreasuryStore } from "@/lib/company-funds";
import { invalidateCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue-cache";
import { recordCompanyFundsEntityHistory } from "@/lib/company-funds-entity-history";

const PREFIX="company.funds.reserve.";
export type ReserveKind="EMERGENCY"|"TAX"|"CLIENT_REFUNDS"|"OPERATING"|"INVESTMENT"|"COUNTRY_MINIMUM"|"OTHER";
export type FinancialReserve={
  id:string;name:string;kind:ReserveKind;country:string|null;currency:string;accountId:string|null;
  targetAmount:number;reservedAmount:number;active:boolean;note:string;createdAt:string;updatedAt:string;
};

function round(v:number){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function parse(value:string):FinancialReserve|null{try{const r=JSON.parse(value) as FinancialReserve;if(!r?.id||!r.name)return null;return{...r,country:r.country||null,currency:String(r.currency||"USD").toUpperCase(),accountId:r.accountId||null,targetAmount:Math.max(0,round(r.targetAmount)),reservedAmount:Math.max(0,round(r.reservedAmount)),active:r.active!==false,note:String(r.note||"")}}catch{return null}}
function reserveSnapshot(r:FinancialReserve):Record<string,unknown>{return{...r}}
function reserveKey(id:string){return`${PREFIX}${id}`}
export async function listFinancialReserves(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:2000,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is FinancialReserve=>Boolean(v))}
export async function getFinancialReserve(id:string){const row=await prisma.appSetting.findUnique({where:{key:reserveKey(id)},select:{value:true}});return row?parse(row.value):null}

async function createReserveRecord(r:FinancialReserve,reason:string){
  await prisma.appSetting.create({data:{key:reserveKey(r.id),value:JSON.stringify(r)}});
  await recordCompanyFundsEntityHistory({entityType:"RESERVE",entityId:r.id,snapshot:reserveSnapshot(r),effectiveAt:r.updatedAt,reason});
  invalidateCompanyFundsWorkQueue();return r;
}

async function mutateReserve(id:string,reasonBefore:string,reasonAfter:string,mutate:(current:FinancialReserve)=>FinancialReserve){
  const result=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial-reserve:${id}`}))`;
    const row=await tx.appSetting.findUnique({where:{key:reserveKey(id)},select:{value:true}});
    const current=row?parse(row.value):null;if(!current)throw new Error("Reserve not found");
    const before:{reserve:FinancialReserve}={reserve:{...current}};
    const next=mutate({...current});
    next.updatedAt=new Date().toISOString();
    await tx.appSetting.update({where:{key:reserveKey(id)},data:{value:JSON.stringify(next)}});
    return{before:before.reserve,next};
  },{isolationLevel:"Serializable"});
  await recordCompanyFundsEntityHistory({entityType:"RESERVE",entityId:id,snapshot:reserveSnapshot(result.before),effectiveAt:result.before.updatedAt||result.before.createdAt,reason:reasonBefore});
  await recordCompanyFundsEntityHistory({entityType:"RESERVE",entityId:id,snapshot:reserveSnapshot(result.next),effectiveAt:result.next.updatedAt,reason:reasonAfter});
  invalidateCompanyFundsWorkQueue();
  return result.next;
}

export async function createFinancialReserve(input:{name:string;kind:ReserveKind;country?:string|null;currency:string;accountId?:string|null;targetAmount:number;reservedAmount:number;note?:string}){
  const treasury=await getTreasuryStore();const currency=input.currency.toUpperCase();const account=input.accountId?treasury.accounts.find(a=>a.id===input.accountId):null;
  if(input.accountId&&!account)throw new Error("Treasury account not found");if(account&&account.currency!==currency)throw new Error("Reserve currency must match treasury account currency");
  const target=Math.max(0,round(input.targetAmount));const reserved=Math.max(0,round(input.reservedAmount));if(!input.name.trim()||target<=0)throw new Error("Reserve name and target are required");if(reserved>target)throw new Error("Reserved amount cannot exceed target amount");
  const now=new Date().toISOString();return createReserveRecord({id:randomUUID(),name:input.name.trim().slice(0,160),kind:input.kind,country:input.country?.trim().slice(0,100)||null,currency,accountId:input.accountId||null,targetAmount:target,reservedAmount:reserved,active:true,note:String(input.note||"").trim().slice(0,1000),createdAt:now,updatedAt:now},"CREATED")
}
export async function updateFinancialReserveAmount(id:string,reservedAmount:number){
  const amount=Math.max(0,round(reservedAmount));
  return mutateReserve(id,"BASELINE_BEFORE_AMOUNT_CHANGE","RESERVED_AMOUNT_UPDATED",r=>{if(amount>r.targetAmount)throw new Error("Reserved amount cannot exceed target amount");r.reservedAmount=amount;return r})
}
export async function setFinancialReserveActive(id:string,active:boolean){
  return mutateReserve(id,"BASELINE_BEFORE_STATUS_CHANGE",active?"REACTIVATED":"SUSPENDED",r=>{r.active=active;return r})
}

export async function getFinancialReserveDashboard(filters?:{country?:string;currency?:string}){
  const [allReserves,treasury]=await Promise.all([listFinancialReserves(),getTreasuryStore()]);
  const country=String(filters?.country||"").trim();const currency=String(filters?.currency||"").trim().toUpperCase();
  const accounts=treasury.accounts.filter(a=>a.active&&(!country||a.country===country)&&(!currency||a.currency===currency));
  const accountIds=new Set(accounts.map(a=>a.id));
  const reserves=allReserves.filter(r=>{
    if(currency&&r.currency!==currency)return false;
    if(!country)return true;
    if(r.accountId)return accountIds.has(r.accountId);
    return r.country===country;
  });
  const active=reserves.filter(r=>r.active);const currencies=[...new Set([...accounts.map(a=>a.currency),...active.map(r=>r.currency)])].sort();
  const byCurrency=currencies.map(rowCurrency=>{const cash=round(accounts.filter(a=>a.currency===rowCurrency).reduce((s,a)=>s+a.balance,0));const target=round(active.filter(r=>r.currency===rowCurrency).reduce((s,r)=>s+r.targetAmount,0));const reserved=round(active.filter(r=>r.currency===rowCurrency).reduce((s,r)=>s+r.reservedAmount,0));const available=round(cash-reserved);return{currency:rowCurrency,cash,target,reserved,available,coveragePercent:target>0?Math.round((reserved/target)*1000)/10:100,shortfall:Math.max(0,round(target-reserved)),overReserved:reserved>cash}});
  const accountUsage=accounts.map(account=>{const reserved=round(active.filter(r=>r.accountId===account.id).reduce((s,r)=>s+r.reservedAmount,0));return{accountId:account.id,name:account.name,country:account.country,currency:account.currency,balance:account.balance,reserved,available:round(account.balance-reserved),overReserved:reserved>account.balance}});
  const countryMinimums=active.filter(r=>r.kind==="COUNTRY_MINIMUM").map(r=>{const cash=round(accounts.filter(a=>a.currency===r.currency&&(!r.country||a.country===r.country)).reduce((s,a)=>s+a.balance,0));return{...r,cash,met:cash>=r.targetAmount,gap:Math.max(0,round(r.targetAmount-cash))}});
  return{reserves,active,byCurrency,accountUsage,countryMinimums,totalActive:active.length,alerts:[...byCurrency.filter(r=>r.overReserved||r.shortfall>0).map(r=>({type:r.overReserved?"CRITICAL":"WATCH",message:r.overReserved?`Réserves ${r.currency} supérieures au cash disponible`:`Objectif de réserve ${r.currency} incomplet: manque ${r.shortfall.toFixed(2)}`})),...accountUsage.filter(a=>a.overReserved).map(a=>({type:"CRITICAL",message:`${a.name}: réserves affectées supérieures au solde du compte`})),...countryMinimums.filter(r=>!r.met).map(r=>({type:"WATCH",message:`Minimum de trésorerie ${r.country||"pays"} (${r.currency}) non atteint`}))]};
}
