import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTreasuryStore, type TreasuryStore } from "@/lib/company-funds";
import { invalidateCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue-cache";

const PREFIX = "company.funds.transfer.";
const TREASURY_STORE_KEY = "company.funds.store";

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
function parseTreasuryStore(value:string):TreasuryStore{try{const v=JSON.parse(value) as TreasuryStore;if(!v||!Array.isArray(v.accounts))throw new Error("Invalid treasury store");return v}catch{throw new Error("Treasury store is unavailable")}}
function transferLock(id:string){return `company-funds-transfer:${id}`;}
function concurrencyError(error:unknown){const code=typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code||""):"";if(code==="P2034")return new Error("Transfer state changed concurrently. Refresh before retrying; no duplicate posting was applied.");return error instanceof Error?error:new Error("Transfer operation failed");}

export async function listTreasuryTransfers(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:5000,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is TreasuryTransfer=>Boolean(v));}
export async function getTreasuryTransfer(id:string){const row=await prisma.appSetting.findUnique({where:{key:`${PREFIX}${id}`},select:{value:true}});return row?parse(row.value):null;}

async function mutatePostedTransfer(id:string,mutate:(transfer:TreasuryTransfer,store:TreasuryStore)=>TreasuryTransfer){
  try{
    const result=await prisma.$transaction(async tx=>{
      // Use the same global store lock as every treasury mutation, then the
      // transfer-specific lock. This keeps account postings and transfer state
      // in one serialization order across the entire finance module.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TREASURY_STORE_KEY}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${transferLock(id)}))`;
      const transferRow=await tx.appSetting.findUnique({where:{key:`${PREFIX}${id}`},select:{value:true}});
      if(!transferRow)throw new Error("Transfer not found");
      const transfer=parse(transferRow.value);
      if(!transfer)throw new Error("Transfer data is invalid");
      const storeRow=await tx.appSetting.findUnique({where:{key:TREASURY_STORE_KEY},select:{value:true}});
      if(!storeRow)throw new Error("Treasury store is unavailable");
      const store=parseTreasuryStore(storeRow.value);
      const updated=mutate(transfer,store);
      store.updatedAt=new Date().toISOString();
      await tx.appSetting.update({where:{key:TREASURY_STORE_KEY},data:{value:JSON.stringify(store)}});
      await tx.appSetting.update({where:{key:`${PREFIX}${id}`},data:{value:JSON.stringify(updated)}});
      return updated;
    },{isolationLevel:"Serializable"});
    invalidateCompanyFundsWorkQueue();
    return result;
  }catch(error){throw concurrencyError(error);}
}

export async function createTreasuryTransfer(input:{fromAccountId:string;toAccountId:string;sentAmount:number;feeAmount:number;fxRate:number;externalReference:string;note:string;createdById:string}){
  if(input.fromAccountId===input.toAccountId)throw new Error("Source and destination accounts must be different");
  const sent=round(input.sentAmount),fee=round(input.feeAmount),rate=Number(input.fxRate);if(sent<=0||fee<0||!Number.isFinite(rate)||rate<=0)throw new Error("Invalid transfer amounts or FX rate");
  try{
    const created=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${TREASURY_STORE_KEY}))`;
      const storeRow=await tx.appSetting.findUnique({where:{key:TREASURY_STORE_KEY},select:{value:true}});if(!storeRow)throw new Error("Treasury store is unavailable");
      const store=parseTreasuryStore(storeRow.value);const from=store.accounts.find(a=>a.id===input.fromAccountId&&a.active);const to=store.accounts.find(a=>a.id===input.toAccountId&&a.active);if(!from||!to)throw new Error("Treasury account not found");
      const expected=round(sent*rate);const now=new Date().toISOString();const id=randomUUID();const t:TreasuryTransfer={id,reference:`TRF-${now.slice(0,10).replaceAll("-","")}-${id.slice(0,6).toUpperCase()}`,fromAccountId:from.id,toAccountId:to.id,fromCurrency:from.currency,toCurrency:to.currency,sentAmount:sent,feeAmount:fee,fxRate:rate,expectedReceivedAmount:expected,actualReceivedAmount:null,status:"DRAFT",initiatedAt:null,completedAt:null,externalReference:input.externalReference.trim().slice(0,180),note:input.note.trim().slice(0,800),createdById:input.createdById,createdAt:now,updatedAt:now};
      await tx.appSetting.create({data:{key:`${PREFIX}${id}`,value:JSON.stringify(t)}});return t;
    },{isolationLevel:"Serializable"});
    invalidateCompanyFundsWorkQueue();return created;
  }catch(error){throw concurrencyError(error);}
}

export async function initiateTreasuryTransfer(id:string){
  return mutatePostedTransfer(id,(t,store)=>{
    if(t.status==="IN_TRANSIT"||t.status==="INITIATED")return t;
    if(t.status!=="DRAFT")throw new Error("Only draft transfers can be initiated");
    const from=store.accounts.find(a=>a.id===t.fromAccountId&&a.active);if(!from)throw new Error("Source account not found or inactive");
    const debit=round(t.sentAmount+t.feeAmount);if(from.balance+0.005<debit)throw new Error(`Insufficient balance: ${from.currency} ${from.balance.toFixed(2)} available`);
    const now=new Date().toISOString();from.balance=round(from.balance-debit);from.updatedAt=now;t.status="IN_TRANSIT";t.initiatedAt=now;t.updatedAt=now;return t;
  });
}

export async function completeTreasuryTransfer(id:string,actualReceivedAmount:number,externalReference?:string){
  const received=round(actualReceivedAmount);if(received<=0)throw new Error("Actual received amount must be greater than zero");
  return mutatePostedTransfer(id,(t,store)=>{
    if(t.status==="COMPLETED"){
      if(t.actualReceivedAmount!=null&&Math.abs(t.actualReceivedAmount-received)<0.005&&(!externalReference?.trim()||t.externalReference===externalReference.trim().slice(0,180)))return t;
      throw new Error("Transfer is already completed with different settlement data");
    }
    if(!["INITIATED","IN_TRANSIT"].includes(t.status))throw new Error("Transfer is not in transit");
    const to=store.accounts.find(a=>a.id===t.toAccountId&&a.active);if(!to)throw new Error("Destination account not found or inactive");
    const now=new Date().toISOString();to.balance=round(to.balance+received);to.updatedAt=now;t.actualReceivedAmount=received;t.status="COMPLETED";t.completedAt=now;t.updatedAt=now;if(externalReference?.trim())t.externalReference=externalReference.trim().slice(0,180);return t;
  });
}

export async function cancelTreasuryTransfer(id:string){
  try{
    const result=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${transferLock(id)}))`;
      const row=await tx.appSetting.findUnique({where:{key:`${PREFIX}${id}`},select:{value:true}});if(!row)throw new Error("Transfer not found");const t=parse(row.value);if(!t)throw new Error("Transfer data is invalid");
      if(t.status==="CANCELLED")return t;if(t.status!=="DRAFT")throw new Error("Only draft transfers can be cancelled");t.status="CANCELLED";t.updatedAt=new Date().toISOString();await tx.appSetting.update({where:{key:`${PREFIX}${id}`},data:{value:JSON.stringify(t)}});return t;
    },{isolationLevel:"Serializable"});
    invalidateCompanyFundsWorkQueue();return result;
  }catch(error){throw concurrencyError(error);}
}

export async function treasuryTransferSummary(){const [transfers,store]=await Promise.all([listTreasuryTransfers(),getTreasuryStore()]);const accountMap=new Map(store.accounts.map(a=>[a.id,a]));const inTransit=transfers.filter(t=>t.status==="IN_TRANSIT");const completed=transfers.filter(t=>t.status==="COMPLETED");const anomalies=completed.filter(t=>t.actualReceivedAmount!=null&&Math.abs(round(t.actualReceivedAmount-t.expectedReceivedAmount))>=0.01);return{transfers,accountMap,inTransitCount:inTransit.length,completedCount:completed.length,anomalyCount:anomalies.length,feesByCurrency:[...new Set(transfers.map(t=>t.fromCurrency))].map(currency=>({currency,amount:round(transfers.filter(t=>t.status!=="CANCELLED"&&t.fromCurrency===currency).reduce((s,t)=>s+t.feeAmount,0))}))};}
