import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getFinancialAuthorization, type FinancialAuthorization, type FinancialAuthorizationType } from "@/lib/company-funds-approvals";
import { getTreasuryStore, saveTreasuryStore } from "@/lib/company-funds";
import { getTreasuryTransfer } from "@/lib/company-funds-transfers";
import { invalidateCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue-cache";
import { recordCompanyFundsEntityHistory } from "@/lib/company-funds-entity-history";

const PREFIX="company.funds.execution-evidence.";
const AUTH_PREFIX="company.funds.authorization.";
export type FinancialExecutionEvidence={
  id:string;authorizationId:string;type:FinancialAuthorizationType;resourceId:string;reference:string;
  treasuryAccountId:string|null;transactionReference:string;proofFileId:string;note:string;
  executedById:string;executedAt:string;createdAt:string;
};
function parse(value:string):FinancialExecutionEvidence|null{try{const v=JSON.parse(value) as FinancialExecutionEvidence;return v?.id&&v?.authorizationId&&v?.proofFileId?v:null}catch{return null}}
function parseAuthorization(value:string):FinancialAuthorization|null{try{const v=JSON.parse(value) as FinancialAuthorization;return v?.id&&v?.resourceId?v:null}catch{return null}}
function normalizeTransactionReference(value:string){return value.trim().toLocaleLowerCase("en-US")}
export async function listFinancialExecutionEvidence(limit=1000){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:limit,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is FinancialExecutionEvidence=>Boolean(v))}
export async function getExecutionEvidenceForAuthorization(authorizationId:string){const rows=await listFinancialExecutionEvidence();return rows.find(e=>e.authorizationId===authorizationId)||null}

export async function createFinancialExecutionEvidence(input:{authorizationId:string;treasuryAccountId?:string|null;transactionReference:string;proofFileId:string;note?:string;executedById:string;executedAt?:string|null}){
  const authorization=await getFinancialAuthorization(input.authorizationId);if(!authorization)throw new Error("Financial authorization not found");if(authorization.status!=="APPROVED")throw new Error("Financial authorization must be approved before execution evidence can be recorded");
  const txRef=input.transactionReference.trim().slice(0,180);if(!txRef)throw new Error("Transaction reference is required");
  const normalizedTxRef=normalizeTransactionReference(txRef);
  const treasury=await getTreasuryStore();const selectedAccount=input.treasuryAccountId?treasury.accounts.find(a=>a.id===input.treasuryAccountId&&a.active):null;if(input.treasuryAccountId&&!selectedAccount)throw new Error("Treasury account not found");
  if(authorization.type==="TRANSFER"){
    const transfer=await getTreasuryTransfer(authorization.resourceId);if(!transfer)throw new Error("Transfer not found");
    if(!["INITIATED","IN_TRANSIT"].includes(transfer.status))throw new Error("Transfer execution evidence can only be recorded after the transfer has been initiated");
    if(!input.treasuryAccountId)throw new Error("Source treasury account is required for transfer execution evidence");
    if(input.treasuryAccountId!==transfer.fromAccountId)throw new Error("Transfer execution evidence must reference the source treasury account");
  }
  const executedAt=input.executedAt?new Date(input.executedAt):new Date();if(Number.isNaN(executedAt.getTime()))throw new Error("Invalid execution date");

  const evidence=await prisma.$transaction(async tx=>{
    // Both the authorization and normalized banking reference are locked. Sorting
    // the lock names keeps multi-lock acquisition deterministic and avoids deadlocks.
    const lockNames=[`financial-evidence-auth:${input.authorizationId}`,`financial-evidence-txref:${normalizedTxRef}`].sort();
    for(const lockName of lockNames)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockName}))`;

    const authRow=await tx.appSetting.findUnique({where:{key:`${AUTH_PREFIX}${input.authorizationId}`},select:{value:true}});
    const currentAuthorization=authRow?parseAuthorization(authRow.value):null;
    if(!currentAuthorization)throw new Error("Financial authorization not found");
    if(currentAuthorization.status!=="APPROVED")throw new Error("Financial authorization must be approved before execution evidence can be recorded");

    const rows=await tx.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:10000,select:{value:true}});
    const all=rows.map(r=>parse(r.value)).filter((v):v is FinancialExecutionEvidence=>Boolean(v));
    const existing=all.find(e=>e.authorizationId===currentAuthorization.id);
    if(existing){
      if(normalizeTransactionReference(existing.transactionReference)!==normalizedTxRef)throw new Error("This financial authorization already has execution evidence with a different transaction reference");
      return existing;
    }
    const reused=all.find(e=>e.authorizationId!==currentAuthorization.id&&normalizeTransactionReference(e.transactionReference)===normalizedTxRef);
    if(reused)throw new Error(`Transaction reference ${txRef} is already linked to another financial execution (${reused.reference}).`);

    const proof=await tx.file.findUnique({where:{id:input.proofFileId},select:{id:true}});if(!proof)throw new Error("Execution proof file not found");
    const now=new Date().toISOString();
    const created:FinancialExecutionEvidence={
      id:randomUUID(),authorizationId:currentAuthorization.id,type:currentAuthorization.type,resourceId:currentAuthorization.resourceId,
      reference:currentAuthorization.reference,treasuryAccountId:input.treasuryAccountId||null,transactionReference:txRef,proofFileId:proof.id,
      note:String(input.note||"").trim().slice(0,1000),executedById:input.executedById,executedAt:executedAt.toISOString(),createdAt:now,
    };
    await tx.appSetting.create({data:{key:`${PREFIX}${created.id}`,value:JSON.stringify(created)}});
    return created;
  },{isolationLevel:"Serializable"});

  if(evidence.type==="INVESTMENT"){
    const investment=treasury.investments.find(i=>i.id===evidence.resourceId);
    if(investment&&investment.status==="PLANNED"){
      const now=new Date().toISOString();
      await recordCompanyFundsEntityHistory({entityType:"INVESTMENT",entityId:investment.id,snapshot:{...investment},effectiveAt:investment.updatedAt||investment.createdAt,reason:"BASELINE_BEFORE_ACTIVATION"});
      investment.status="ACTIVE";investment.updatedAt=now;await saveTreasuryStore(treasury);
      await recordCompanyFundsEntityHistory({entityType:"INVESTMENT",entityId:investment.id,snapshot:{...investment},effectiveAt:now,reason:"ACTIVATED_BY_EXECUTION_EVIDENCE"});
    }
  }
  invalidateCompanyFundsWorkQueue();
  return evidence;
}
export async function executionEvidenceComplete(type:FinancialAuthorizationType,resourceId:string){const rows=await listFinancialExecutionEvidence();return rows.some(e=>e.type===type&&e.resourceId===resourceId)}