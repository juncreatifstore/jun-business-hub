import "server-only";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTreasuryStore } from "@/lib/company-funds";
import { getFinancialReserveDashboard } from "@/lib/company-funds-reserves";
import { buildCompanyFinanceEntries } from "@/lib/company-funds-finance-sync";
import { assertFinancialMonthReadyToClose } from "@/lib/company-funds-monthly-close-validation";

const PREFIX="company.funds.month-close.";
const REVISION_PREFIX="company.funds.month-close-revision.";
export type MonthCloseStatus="CLOSED"|"REOPENED";
export type MonthlyCloseSnapshot={
  accounts:Array<{id:string;name:string;country:string;institution:string;currency:string;balance:number}>;
  reserves:Array<{id:string;name:string;kind:string;country:string|null;currency:string;targetAmount:number;reservedAmount:number}>;
  loans:Array<{id:string;lender:string;currency:string;principal:number;outstandingBalance:number;interestRate:number;dueDate:string;status:string}>;
  investments:Array<{id:string;name:string;country:string;currency:string;amount:number;status:string}>;
  financeByCurrency:Array<{currency:string;income:number;refunds:number;expenses:number;fees:number;net:number;entryCount:number}>;
};
export type MonthlyCloseIntegrity={algorithm:"SHA-256";snapshotHash:string;previousHash:string|null;chainHash:string};
export type MonthlyFinancialClose={
  id:string;period:string;status:MonthCloseStatus;revision:number;closedAt:string;closedById:string;closeNote:string;
  reopenedAt:string|null;reopenedById:string|null;reopenReason:string|null;snapshot:MonthlyCloseSnapshot;integrity?:MonthlyCloseIntegrity|null;
};
export type MonthlyCloseRevision={
  id:string;period:string;revision:number;event:"CLOSED"|"REOPENED";recordedAt:string;recordedById:string;
  reason:string;snapshot:MonthlyCloseSnapshot;status:MonthCloseStatus;integrity?:MonthlyCloseIntegrity|null;
};
export type MonthlyCloseVariance={currency:string;income:number;refunds:number;expenses:number;fees:number;net:number;entryCount:number};
export type MonthlyCloseIntegrityCheck={status:"VERIFIED"|"LEGACY"|"BROKEN";checked:number;verified:number;legacy:number;broken:number;latestHash:string|null;issues:string[]};
function key(period:string){return `${PREFIX}${period}`}
function revisionKey(period:string,revision:number,event:string){return `${REVISION_PREFIX}${period}.${String(revision).padStart(4,"0")}.${event.toLowerCase()}.${randomUUID()}`}
function validPeriod(period:string){return /^\d{4}-(0[1-9]|1[0-2])$/.test(period)}
function round(v:number){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function canonical(value:unknown):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;const obj=value as Record<string,unknown>;return `{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`}
function hash(value:unknown){return createHash("sha256").update(typeof value==="string"?value:canonical(value)).digest("hex")}
function normalizeClose(v:MonthlyFinancialClose):MonthlyFinancialClose{return{...v,revision:Math.max(1,Number(v.revision||1)),integrity:v.integrity||null}}
function parse(value:string):MonthlyFinancialClose|null{try{const v=JSON.parse(value) as MonthlyFinancialClose;return v?.id&&validPeriod(v.period)&&v.snapshot?normalizeClose(v):null}catch{return null}}
function parseRevision(value:string):MonthlyCloseRevision|null{try{const v=JSON.parse(value) as MonthlyCloseRevision;return v?.id&&validPeriod(v.period)&&v.snapshot?{...v,integrity:v.integrity||null}:null}catch{return null}}
export function periodBounds(period:string){if(!validPeriod(period))throw new Error("Invalid closing period");const [y,m]=period.split("-").map(Number);const start=new Date(Date.UTC(y,m-1,1));const end=new Date(Date.UTC(y,m,1));return{start,end}}
export async function listMonthlyFinancialCloses(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX,not:{startsWith:REVISION_PREFIX}}},orderBy:{key:"desc"},take:240,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is MonthlyFinancialClose=>Boolean(v))}
export async function getMonthlyFinancialClose(period:string){const row=await prisma.appSetting.findUnique({where:{key:key(period)},select:{value:true}});return row?parse(row.value):null}
export async function listMonthlyCloseRevisions(period:string){if(!validPeriod(period))throw new Error("Invalid closing period");const rows=await prisma.appSetting.findMany({where:{key:{startsWith:`${REVISION_PREFIX}${period}.`}},orderBy:{updatedAt:"asc"},take:500,select:{value:true}});return rows.map(r=>parseRevision(r.value)).filter((v):v is MonthlyCloseRevision=>Boolean(v)).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))}
export async function isFinancialPeriodClosed(date:Date|string){const d=typeof date==="string"?new Date(date):date;if(Number.isNaN(d.getTime()))throw new Error("Invalid financial date");const period=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;const close=await getMonthlyFinancialClose(period);return Boolean(close&&close.status==="CLOSED")}
export async function assertFinancialPeriodOpen(date:Date|string){if(await isFinancialPeriodClosed(date))throw new Error("Financial period is closed. Reopen the month before posting a historical correction.")}

async function buildSnapshot(period:string):Promise<MonthlyCloseSnapshot>{
  const [{start,end},treasury,reserves,entries]=await Promise.all([Promise.resolve(periodBounds(period)),getTreasuryStore(),getFinancialReserveDashboard(),buildCompanyFinanceEntries()]);
  const monthEntries=entries.filter(e=>{const t=new Date(e.occurredAt).getTime();return t>=start.getTime()&&t<end.getTime()});
  const currencies=[...new Set(monthEntries.map(e=>e.currency))].sort();
  const financeByCurrency=currencies.map(currency=>{const rows=monthEntries.filter(e=>e.currency===currency);const income=round(rows.filter(e=>e.sourceType==="PAYMENT").reduce((s,e)=>s+e.amount,0));const refunds=round(rows.filter(e=>e.sourceType==="REFUND").reduce((s,e)=>s+e.amount,0));const expenses=round(rows.filter(e=>e.sourceType==="EXPENSE").reduce((s,e)=>s+e.amount,0));const fees=round(rows.filter(e=>e.sourceType==="PAYMENT_FEE").reduce((s,e)=>s+e.amount,0));return{currency,income,refunds,expenses,fees,net:round(income-refunds-expenses-fees),entryCount:rows.length}});
  return{
    accounts:treasury.accounts.filter(a=>a.active).map(a=>({id:a.id,name:a.name,country:a.country,institution:a.institution,currency:a.currency,balance:round(a.balance)})),
    reserves:reserves.active.map(r=>({id:r.id,name:r.name,kind:r.kind,country:r.country,currency:r.currency,targetAmount:round(r.targetAmount),reservedAmount:round(r.reservedAmount)})),
    loans:treasury.loans.map(l=>({id:l.id,lender:l.lender,currency:l.currency,principal:round(l.principal),outstandingBalance:round(l.outstandingBalance),interestRate:l.interestRate,dueDate:l.dueDate,status:l.status})),
    investments:treasury.investments.map(i=>({id:i.id,name:i.name,country:i.country,currency:i.currency,amount:round(i.amount),status:i.status})),
    financeByCurrency,
  };
}
async function archiveRevision(row:MonthlyFinancialClose,event:"CLOSED"|"REOPENED",userId:string,reason:string){
  const existing=await listMonthlyCloseRevisions(row.period);const previousHash=[...existing].reverse().find(r=>r.integrity?.chainHash)?.integrity?.chainHash||null;const recordedAt=new Date().toISOString();const snapshotHash=hash(row.snapshot);
  const payload={period:row.period,revision:row.revision,event,recordedAt,recordedById:userId,reason:reason.trim().slice(0,2000),snapshotHash,previousHash,status:row.status};
  const integrity:MonthlyCloseIntegrity={algorithm:"SHA-256",snapshotHash,previousHash,chainHash:hash(payload)};
  const revision:MonthlyCloseRevision={id:randomUUID(),period:row.period,revision:row.revision,event,recordedAt,recordedById:userId,reason:payload.reason,snapshot:row.snapshot,status:row.status,integrity};
  await prisma.appSetting.create({data:{key:revisionKey(row.period,row.revision,event),value:JSON.stringify(revision)}});return revision
}
export function compareMonthlyCloseSnapshots(before:MonthlyCloseSnapshot,after:MonthlyCloseSnapshot):MonthlyCloseVariance[]{const currencies=[...new Set([...before.financeByCurrency.map(r=>r.currency),...after.financeByCurrency.map(r=>r.currency)])].sort();return currencies.map(currency=>{const a=before.financeByCurrency.find(r=>r.currency===currency);const b=after.financeByCurrency.find(r=>r.currency===currency);return{currency,income:round((b?.income||0)-(a?.income||0)),refunds:round((b?.refunds||0)-(a?.refunds||0)),expenses:round((b?.expenses||0)-(a?.expenses||0)),fees:round((b?.fees||0)-(a?.fees||0)),net:round((b?.net||0)-(a?.net||0)),entryCount:(b?.entryCount||0)-(a?.entryCount||0)}})}
export async function verifyMonthlyCloseIntegrity(period:string):Promise<MonthlyCloseIntegrityCheck>{
  const revisions=await listMonthlyCloseRevisions(period);let previousHash:string|null=null,verified=0,legacy=0,broken=0;const issues:string[]=[];
  for(const r of revisions){if(!r.integrity){legacy++;continue}const snapshotHash=hash(r.snapshot);const payload={period:r.period,revision:r.revision,event:r.event,recordedAt:r.recordedAt,recordedById:r.recordedById,reason:r.reason,snapshotHash,previousHash:r.integrity.previousHash,status:r.status};const chainHash=hash(payload);const okSnapshot=snapshotHash===r.integrity.snapshotHash;const okPrevious=r.integrity.previousHash===previousHash;const okChain=chainHash===r.integrity.chainHash;if(okSnapshot&&okPrevious&&okChain){verified++;previousHash=r.integrity.chainHash}else{broken++;issues.push(`Révision ${r.revision} ${r.event}: empreinte invalide`);previousHash=r.integrity.chainHash}}
  }
  const status:MonthlyCloseIntegrityCheck["status"]=broken>0?"BROKEN":legacy>0?"LEGACY":"VERIFIED";return{status,checked:revisions.length,verified,legacy,broken,latestHash:previousHash,issues}
}
export async function getMonthlyCloseRevisionSummary(period:string){const [current,revisions,integrity]=await Promise.all([getMonthlyFinancialClose(period),listMonthlyCloseRevisions(period),verifyMonthlyCloseIntegrity(period)]);const previousClosed=[...revisions].reverse().find(r=>r.event==="CLOSED"&&r.revision<(current?.revision||0));const variance=current&&previousClosed&&current.revision>previousClosed.revision?compareMonthlyCloseSnapshots(previousClosed.snapshot,current.snapshot):[];return{current,revisions,previousClosed,variance,integrity}}
export async function closeFinancialMonth(period:string,userId:string,note:string){if(!validPeriod(period))throw new Error("Invalid closing period");const existing=await getMonthlyFinancialClose(period);if(existing?.status==="CLOSED")throw new Error("This month is already closed");const {end}=periodBounds(period);if(end.getTime()>Date.now())throw new Error("A future month cannot be closed");await assertFinancialMonthReadyToClose(period);const now=new Date().toISOString();const snapshot=await buildSnapshot(period);const revision=existing?existing.revision+1:1;const row:MonthlyFinancialClose={id:existing?.id||randomUUID(),period,status:"CLOSED",revision,closedAt:now,closedById:userId,closeNote:note.trim().slice(0,2000),reopenedAt:null,reopenedById:null,reopenReason:null,snapshot,integrity:null};await prisma.appSetting.upsert({where:{key:key(period)},create:{key:key(period),value:JSON.stringify(row)},update:{value:JSON.stringify(row)}});const archived=await archiveRevision(row,"CLOSED",userId,row.closeNote||`Clôture révision ${revision}`);row.integrity=archived.integrity||null;await prisma.appSetting.update({where:{key:key(period)},data:{value:JSON.stringify(row)}});return row}
export async function reopenFinancialMonth(period:string,userId:string,reason:string){const row=await getMonthlyFinancialClose(period);if(!row||row.status!=="CLOSED")throw new Error("This financial month is not closed");if(reason.trim().length<10)throw new Error("A detailed reopening reason is required");const archived=await archiveRevision(row,"REOPENED",userId,reason);row.status="REOPENED";row.reopenedAt=new Date().toISOString();row.reopenedById=userId;row.reopenReason=reason.trim().slice(0,2000);row.integrity=archived.integrity||null;await prisma.appSetting.update({where:{key:key(period)},data:{value:JSON.stringify(row)}});return row}
