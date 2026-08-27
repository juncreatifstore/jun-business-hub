import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTreasuryStore, saveTreasuryStore } from "@/lib/company-funds";

const PREFIX = "company.funds.transfer.";

export type TreasuryTransferStatus = "DRAFT"|"INITIATED"|"IN_TRANSIT"|"COMPLETED"|"CANCELLED";
export type TreasuryTransfer = {
  id:string; reference:string; fromAccountId:string; toAccountId:string;
  fromCurrency:string; toCurrency:string; sentAmount:number; feeAmount:number; fxRate:number;
  expectedReceivedAmount:number; actualReceivedAmount:number|null; status:TreasuryTransferStatus;
  initiatedAt:string|null; completedAt:string|null; externalReference:string; note:string;
  createdById:string; createdAt:string; updatedAt:string;
};

function round(n:number){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function parse(value:string):TreasuryTransfer|null{try{const v=JSON.parse(value) as TreasuryTransfer;return v?.id&&v?.reference?v:null;}catch{return null;}}
export async function listTreasuryTransfers(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:5000,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is TreasuryTransfer=>Boolean(v));}
export async function getTreasuryTransfer(id:string){const row=await prisma.appSetting.findUnique({where:{key:`${PREFIX}${id}`},select:{value:true}});return row?parse(row.value):null;}
async function save(t:TreasuryTransfer){await prisma.appSetting.upsert({where:{key:`${PREFIX}${t.id}`},create:{key:`${PREFIX}${t.id}`,value:JSON.stringify(t)},update:{value:JSON.stringify(t)}});return t;}

export async function createTreasuryTransfer(input:{fromAccountId:string;toAccountId:string;sentAmount:number;feeAmount:number;fxRate:number;externalReference:string;note:string;createdById:string}){
  if(input.fromAccountId===input.toAccountId)throw new Error("Source and destination accounts must be different");
  const store=await getTreasuryStore();const from=store.accounts.find(a=>a.id===input.fromAccountId&&a.active);const to=store.accounts.find(a=>a.id===input.toAccountId&&a.active);if(!from||!to)throw new Error("Treasury account not found");
  const sent=round(input.sentAmount),fee=round(input.feeAmount),rate=Number(input.fxRate);if(sent<=0||fee<0||!Number.isFinite(rate)||rate<=0)throw new Error("Invalid transfer amounts or FX rate");
  const expected=round(sent*rate);const now=new Date().toISOString();const id=randomUUID();const t:TreasuryTransfer={id,reference:`TRF-${now.slice(0,10).replaceAll("-","")}-${id.slice(0,6).toUpperCase()}`,fromAccountId:from.id,toAccountId:to.id,fromCurrency:from.currency,toCurrency:to.currency,sentAmount:sent,feeAmount:fee,fxRate:rate,expectedReceivedAmount:expected,actualReceivedAmount:null,status:"DRAFT",initiatedAt:null,completedAt:null,externalReference:input.externalReference.trim().slice(0,180),note:input.note.trim().slice(0,800),createdById:input.createdById,createdAt:now,updatedAt:now};return save(t);
}

export async function initiateTreasuryTransfer(id:string){const t=await getTreasuryTransfer(id);if(!t)throw new Error("Transfer not found");if(t.status!=="DRAFT")throw new Error("Only draft transfers can be initiated");const store=await getTreasuryStore();const from=store.accounts.find(a=>a.id===t.fromAccountId);if(!from)throw new Error("Source account not found");const debit=round(t.sentAmount+t.feeAmount);if(from.balance+0.005<debit)throw new Error(`Insufficient balance: ${from.currency} ${from.balance.toFixed(2)} available`);from.balance=round(from.balance-debit);from.updatedAt=new Date().toISOString();await saveTreasuryStore(store);t.status="IN_TRANSIT";t.initiatedAt=new Date().toISOString();t.updatedAt=t.initiatedAt;return save(t);}

export async function completeTreasuryTransfer(id:string,actualReceivedAmount:number,externalReference?:string){const t=await getTreasuryTransfer(id);if(!t)throw new Error("Transfer not found");if(!["INITIATED","IN_TRANSIT"].includes(t.status))throw new Error("Transfer is not in transit");const received=round(actualReceivedAmount);if(received<=0)throw new Error("Actual received amount must be greater than zero");const store=await getTreasuryStore();const to=store.accounts.find(a=>a.id===t.toAccountId);if(!to)throw new Error("Destination account not found");to.balance=round(to.balance+received);to.updatedAt=new Date().toISOString();await saveTreasuryStore(store);t.actualReceivedAmount=received;t.status="COMPLETED";t.completedAt=new Date().toISOString();t.updatedAt=t.completedAt;if(externalReference?.trim())t.externalReference=externalReference.trim().slice(0,180);return save(t);}

export async function cancelTreasuryTransfer(id:string){const t=await getTreasuryTransfer(id);if(!t)throw new Error("Transfer not found");if(t.status!=="DRAFT")throw new Error("Only draft transfers can be cancelled");t.status="CANCELLED";t.updatedAt=new Date().toISOString();return save(t);}

export async function treasuryTransferSummary(){const [transfers,store]=await Promise.all([listTreasuryTransfers(),getTreasuryStore()]);const accountMap=new Map(store.accounts.map(a=>[a.id,a]));const inTransit=transfers.filter(t=>t.status==="IN_TRANSIT");const completed=transfers.filter(t=>t.status==="COMPLETED");const anomalies=completed.filter(t=>t.actualReceivedAmount!=null&&Math.abs(round(t.actualReceivedAmount-t.expectedReceivedAmount))>=0.01);return{transfers,accountMap,inTransitCount:inTransit.length,completedCount:completed.length,anomalyCount:anomalies.length,feesByCurrency:[...new Set(transfers.map(t=>t.fromCurrency))].map(currency=>({currency,amount:round(transfers.filter(t=>t.status!=="CANCELLED"&&t.fromCurrency===currency).reduce((s,t)=>s+t.feeAmount,0))}))};}
