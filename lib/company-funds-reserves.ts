import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTreasuryStore } from "@/lib/company-funds";
import { invalidateCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue-cache";

const PREFIX="company.funds.reserve.";
export type ReserveKind="EMERGENCY"|"TAX"|"CLIENT_REFUNDS"|"OPERATING"|"INVESTMENT"|"COUNTRY_MINIMUM"|"OTHER";
export type FinancialReserve={
  id:string;name:string;kind:ReserveKind;country:string|null;currency:string;accountId:string|null;
  targetAmount:number;reservedAmount:number;active:boolean;note:string;createdAt:string;updatedAt:string;
};

function round(v:number){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function parse(value:string):FinancialReserve|null{try{const r=JSON.parse(value) as FinancialReserve;if(!r?.id||!r.name)return null;return{...r,country:r.country||null,currency:String(r.currency||"USD").toUpperCase(),accountId:r.accountId||null,targetAmount:Math.max(0,round(r.targetAmount)),reservedAmount:Math.max(0,round(r.reservedAmount)),active:r.active!==false,note:String(r.note||"")}}catch{return null}}
export async function listFinancialReserves(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:2000,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is FinancialReserve=>Boolean(v))}
export async function getFinancialReserve(id:string){const row=await prisma.appSetting.findUnique({where:{key:`${PREFIX}${id}`},select:{value:true}});return row?parse(row.value):null}
async function save(r:FinancialReserve){await prisma.appSetting.upsert({where:{key:`${PREFIX}${r.id}`},create:{key:`${PREFIX}${r.id}`,value:JSON.stringify(r)},update:{value:JSON.stringify(r)}});invalidateCompanyFundsWorkQueue();return r}
export async function createFinancialReserve(input:{name:string;kind:ReserveKind;country?:string|null;currency:string;accountId?:string|null;targetAmount:number;reservedAmount:number;note?:string}){
  const treasury=await getTreasuryStore();const currency=input.currency.toUpperCase();const account=input.accountId?treasury.accounts.find(a=>a.id===input.accountId):null;
  if(input.accountId&&!account)throw new Error("Treasury account not found");if(account&&account.currency!==currency)throw new Error("Reserve currency must match treasury account currency");
  const target=Math.max(0,round(input.targetAmount));const reserved=Math.max(0,round(input.reservedAmount));if(!input.name.trim()||target<=0)throw new Error("Reserve name and target are required");if(reserved>target)throw new Error("Reserved amount cannot exceed target amount");
  const now=new Date().toISOString();return save({id:randomUUID(),name:input.name.trim().slice(0,160),kind:input.kind,country:input.country?.trim().slice(0,100)||null,currency,accountId:input.accountId||null,targetAmount:target,reservedAmount:reserved,active:true,note:String(input.note||"").trim().slice(0,1000),createdAt:now,updatedAt:now})
}
export async function updateFinancialReserveAmount(id:string,reservedAmount:number){const r=await getFinancialReserve(id);if(!r)throw new Error("Reserve not found");const amount=Math.max(0,round(reservedAmount));if(amount>r.targetAmount)throw new Error("Reserved amount cannot exceed target amount");r.reservedAmount=amount;r.updatedAt=new Date().toISOString();return save(r)}
export async function setFinancialReserveActive(id:string,active:boolean){const r=await getFinancialReserve(id);if(!r)throw new Error("Reserve not found");r.active=active;r.updatedAt=new Date().toISOString();return save(r)}

export async function getFinancialReserveDashboard(){
  const [reserves,treasury]=await Promise.all([listFinancialReserves(),getTreasuryStore()]);const active=reserves.filter(r=>r.active);const currencies=[...new Set([...treasury.accounts.filter(a=>a.active).map(a=>a.currency),...active.map(r=>r.currency)])].sort();
  const byCurrency=currencies.map(currency=>{const cash=round(treasury.accounts.filter(a=>a.active&&a.currency===currency).reduce((s,a)=>s+a.balance,0));const target=round(active.filter(r=>r.currency===currency).reduce((s,r)=>s+r.targetAmount,0));const reserved=round(active.filter(r=>r.currency===currency).reduce((s,r)=>s+r.reservedAmount,0));const available=round(cash-reserved);return{currency,cash,target,reserved,available,coveragePercent:target>0?Math.round((reserved/target)*1000)/10:100,shortfall:Math.max(0,round(target-reserved)),overReserved:reserved>cash}});
  const accountUsage=treasury.accounts.filter(a=>a.active).map(account=>{const reserved=round(active.filter(r=>r.accountId===account.id).reduce((s,r)=>s+r.reservedAmount,0));return{accountId:account.id,name:account.name,country:account.country,currency:account.currency,balance:account.balance,reserved,available:round(account.balance-reserved),overReserved:reserved>account.balance}});
  const countryMinimums=active.filter(r=>r.kind==="COUNTRY_MINIMUM").map(r=>{const cash=round(treasury.accounts.filter(a=>a.active&&a.currency===r.currency&&(!r.country||a.country===r.country)).reduce((s,a)=>s+a.balance,0));return{...r,cash,met:cash>=r.targetAmount,gap:Math.max(0,round(r.targetAmount-cash))}});
  return{reserves,active,byCurrency,accountUsage,countryMinimums,totalActive:active.length,alerts:[...byCurrency.filter(r=>r.overReserved||r.shortfall>0).map(r=>({type:r.overReserved?"CRITICAL":"WATCH",message:r.overReserved?`Réserves ${r.currency} supérieures au cash disponible`:`Objectif de réserve ${r.currency} incomplet: manque ${r.shortfall.toFixed(2)}`})),...accountUsage.filter(a=>a.overReserved).map(a=>({type:"CRITICAL",message:`${a.name}: réserves affectées supérieures au solde du compte`})),...countryMinimums.filter(r=>!r.met).map(r=>({type:"WATCH",message:`Minimum de trésorerie ${r.country||"pays"} (${r.currency}) non atteint`}))]};
}
