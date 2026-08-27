import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getFinancialAuthorization, type FinancialAuthorizationType } from "@/lib/company-funds-approvals";
import { getTreasuryStore, saveTreasuryStore } from "@/lib/company-funds";
import { getTreasuryTransfer } from "@/lib/company-funds-transfers";

const PREFIX="company.funds.execution-evidence.";
export type FinancialExecutionEvidence={
  id:string;authorizationId:string;type:FinancialAuthorizationType;resourceId:string;reference:string;
  treasuryAccountId:string|null;transactionReference:string;proofFileId:string;note:string;
  executedById:string;executedAt:string;createdAt:string;
};
function parse(value:string):FinancialExecutionEvidence|null{try{const v=JSON.parse(value) as FinancialExecutionEvidence;return v?.id&&v?.authorizationId&&v?.proofFileId?v:null}catch{return null}}
export async function listFinancialExecutionEvidence(limit=1000){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:PREFIX}},orderBy:{updatedAt:"desc"},take:limit,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is FinancialExecutionEvidence=>Boolean(v))}
export async function getExecutionEvidenceForAuthorization(authorizationId:string){const rows=await listFinancialExecutionEvidence();return rows.find(e=>e.authorizationId===authorizationId)||null}
export async function createFinancialExecutionEvidence(input:{authorizationId:string;treasuryAccountId?:string|null;transactionReference:string;proofFileId:string;note?:string;executedById:string;executedAt?:string|null}){
  const authorization=await getFinancialAuthorization(input.authorizationId);if(!authorization)throw new Error("Financial authorization not found");if(authorization.status!=="APPROVED")throw new Error("Financial authorization must be approved before execution evidence can be recorded");
  const existing=await getExecutionEvidenceForAuthorization(authorization.id);if(existing)return existing;
  const txRef=input.transactionReference.trim().slice(0,180);if(!txRef)throw new Error("Transaction reference is required");
  const proof=await prisma.file.findUnique({where:{id:input.proofFileId},select:{id:true}});if(!proof)throw new Error("Execution proof file not found");
  const treasury=await getTreasuryStore();const selectedAccount=input.treasuryAccountId?treasury.accounts.find(a=>a.id===input.treasuryAccountId&&a.active):null;if(input.treasuryAccountId&&!selectedAccount)throw new Error("Treasury account not found");
  if(authorization.type==="TRANSFER"){
    const transfer=await getTreasuryTransfer(authorization.resourceId);if(!transfer)throw new Error("Transfer not found");
    if(!["INITIATED","IN_TRANSIT"].includes(transfer.status))throw new Error("Transfer execution evidence can only be recorded after the transfer has been initiated");
    if(!input.treasuryAccountId)throw new Error("Source treasury account is required for transfer execution evidence");
    if(input.treasuryAccountId!==transfer.fromAccountId)throw new Error("Transfer execution evidence must reference the source treasury account");
  }
  const executedAt=input.executedAt?new Date(input.executedAt):new Date();if(Number.isNaN(executedAt.getTime()))throw new Error("Invalid execution date");
  const now=new Date().toISOString();const evidence:FinancialExecutionEvidence={id:randomUUID(),authorizationId:authorization.id,type:authorization.type,resourceId:authorization.resourceId,reference:authorization.reference,treasuryAccountId:input.treasuryAccountId||null,transactionReference:txRef,proofFileId:proof.id,note:String(input.note||"").trim().slice(0,1000),executedById:input.executedById,executedAt:executedAt.toISOString(),createdAt:now};
  await prisma.appSetting.create({data:{key:`${PREFIX}${evidence.id}`,value:JSON.stringify(evidence)}});
  if(authorization.type==="INVESTMENT"){
    const investment=treasury.investments.find(i=>i.id===authorization.resourceId);if(investment&&investment.status==="PLANNED"){investment.status="ACTIVE";investment.updatedAt=now;await saveTreasuryStore(treasury)}
  }
  return evidence;
}
export async function executionEvidenceComplete(type:FinancialAuthorizationType,resourceId:string){const rows=await listFinancialExecutionEvidence();return rows.some(e=>e.type===type&&e.resourceId===resourceId)}
