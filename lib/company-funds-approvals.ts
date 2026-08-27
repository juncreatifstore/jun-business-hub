import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getFinancialReserveDashboard } from "@/lib/company-funds-reserves";
import { getTreasuryTransfer } from "@/lib/company-funds-transfers";

const REQUEST_PREFIX="company.funds.authorization.";
const POLICY_KEY="company.funds.authorization.policy";

export type FinancialAuthorizationStatus="PENDING"|"APPROVED"|"REJECTED"|"CANCELLED";
export type FinancialAuthorizationType="TRANSFER"|"EXPENSE"|"REFUND"|"INVESTMENT"|"LOAN"|"RESERVE_OVERRIDE"|"OTHER";
export type FinancialApprovalDecision={userId:string;decision:"APPROVE"|"REJECT";note:string;decidedAt:string};
export type FinancialAuthorization={
  id:string;type:FinancialAuthorizationType;resourceId:string;reference:string;description:string;
  amount:number;currency:string;requestedById:string;requiredApprovals:number;reason:string;
  reserveImpact:boolean;status:FinancialAuthorizationStatus;decisions:FinancialApprovalDecision[];
  createdAt:string;updatedAt:string;approvedAt:string|null;rejectedAt:string|null;
};
export type FinancialAuthorizationPolicy={singleApprovalThreshold:number;dualApprovalThreshold:number;reserveOverrideAlwaysDual:boolean};

const DEFAULT_POLICY:FinancialAuthorizationPolicy={singleApprovalThreshold:1000,dualApprovalThreshold:5000,reserveOverrideAlwaysDual:true};
function round(v:number){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}
function parse(value:string):FinancialAuthorization|null{try{const v=JSON.parse(value) as FinancialAuthorization;return v?.id&&v?.resourceId?{...v,amount:round(v.amount),decisions:Array.isArray(v.decisions)?v.decisions:[]}:null}catch{return null}}
export async function getFinancialAuthorizationPolicy(){const row=await prisma.appSetting.findUnique({where:{key:POLICY_KEY},select:{value:true}});if(!row)return DEFAULT_POLICY;try{const p=JSON.parse(row.value) as Partial<FinancialAuthorizationPolicy>;return{singleApprovalThreshold:Math.max(0,Number(p.singleApprovalThreshold??DEFAULT_POLICY.singleApprovalThreshold)),dualApprovalThreshold:Math.max(0,Number(p.dualApprovalThreshold??DEFAULT_POLICY.dualApprovalThreshold)),reserveOverrideAlwaysDual:p.reserveOverrideAlwaysDual!==false}}catch{return DEFAULT_POLICY}}
export async function saveFinancialAuthorizationPolicy(policy:FinancialAuthorizationPolicy){const value=JSON.stringify(policy);await prisma.appSetting.upsert({where:{key:POLICY_KEY},create:{key:POLICY_KEY,value},update:{value}});return policy}
export async function listFinancialAuthorizations(limit=1000){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:REQUEST_PREFIX}},orderBy:{updatedAt:"desc"},take:limit,select:{value:true}});return rows.map(r=>parse(r.value)).filter((v):v is FinancialAuthorization=>Boolean(v))}
export async function getFinancialAuthorization(id:string){const row=await prisma.appSetting.findUnique({where:{key:`${REQUEST_PREFIX}${id}`},select:{value:true}});return row?parse(row.value):null}
async function save(a:FinancialAuthorization){await prisma.appSetting.upsert({where:{key:`${REQUEST_PREFIX}${a.id}`},create:{key:`${REQUEST_PREFIX}${a.id}`,value:JSON.stringify(a)},update:{value:JSON.stringify(a)}});return a}
export async function findAuthorizationForResource(type:FinancialAuthorizationType,resourceId:string){const all=await listFinancialAuthorizations();return all.find(a=>a.type===type&&a.resourceId===resourceId&&!['CANCELLED'].includes(a.status))||null}

export async function createFinancialAuthorization(input:{type:FinancialAuthorizationType;resourceId:string;reference:string;description:string;amount:number;currency:string;requestedById:string;requiredApprovals:number;reason:string;reserveImpact?:boolean}){
  const existing=await findAuthorizationForResource(input.type,input.resourceId);if(existing&&["PENDING","APPROVED"].includes(existing.status))return existing;
  const now=new Date().toISOString();const requiredApprovals=Math.max(0,Math.min(3,Math.trunc(input.requiredApprovals)));const autoApproved=requiredApprovals===0;
  const a:FinancialAuthorization={id:randomUUID(),type:input.type,resourceId:input.resourceId,reference:input.reference.trim().slice(0,160),description:input.description.trim().slice(0,800),amount:round(input.amount),currency:input.currency.toUpperCase(),requestedById:input.requestedById,requiredApprovals,reason:input.reason.trim().slice(0,1000),reserveImpact:Boolean(input.reserveImpact),status:autoApproved?"APPROVED":"PENDING",decisions:[],createdAt:now,updatedAt:now,approvedAt:autoApproved?now:null,rejectedAt:null};return save(a)
}

export async function decideFinancialAuthorization(id:string,userId:string,decision:"APPROVE"|"REJECT",note:string){const a=await getFinancialAuthorization(id);if(!a)throw new Error("Authorization not found");if(a.status!=="PENDING")throw new Error("Authorization is no longer pending");if(a.requestedById===userId)throw new Error("Requester cannot approve their own financial authorization");if(a.decisions.some(d=>d.userId===userId))throw new Error("You already decided this authorization");const now=new Date().toISOString();a.decisions.push({userId,decision,note:note.trim().slice(0,1000),decidedAt:now});if(decision==="REJECT"){a.status="REJECTED";a.rejectedAt=now}else{const approvals=a.decisions.filter(d=>d.decision==="APPROVE").length;if(approvals>=a.requiredApprovals){a.status="APPROVED";a.approvedAt=now}}a.updatedAt=now;return save(a)}

export async function ensureFinancialAuthorization(input:{type:FinancialAuthorizationType;resourceId:string;reference:string;description:string;amount:number;currency:string;requestedById:string;accountId?:string|null}){
  const existing=await findAuthorizationForResource(input.type,input.resourceId);if(existing)return existing;
  const [policy,reserves]=await Promise.all([getFinancialAuthorizationPolicy(),getFinancialReserveDashboard()]);const amount=round(input.amount);const currency=input.currency.toUpperCase();
  const account=input.accountId?reserves.accountUsage.find(a=>a.accountId===input.accountId):null;
  const currencyRow=reserves.byCurrency.find(r=>r.currency===currency);
  const available=account?account.available:currencyRow?.available;
  const reserveImpact=available!=null&&amount>available+0.005;
  let required=amount>=policy.dualApprovalThreshold?2:amount>=policy.singleApprovalThreshold?1:0;if(reserveImpact&&policy.reserveOverrideAlwaysDual)required=Math.max(required,2);
  const reason=reserveImpact?"La sortie dépasse le cash libre après réserves protégées.":required===2?"Montant supérieur au seuil de double approbation.":required===1?"Montant supérieur au seuil d’approbation.":"Opération sous les seuils d’approbation configurés.";
  return createFinancialAuthorization({...input,amount,currency,requiredApprovals:required,reason,reserveImpact});
}

export async function financialAuthorizationApproved(type:FinancialAuthorizationType,resourceId:string){const a=await findAuthorizationForResource(type,resourceId);return Boolean(a&&a.status==="APPROVED")}

export async function ensureTransferAuthorization(transferId:string,requestedById:string){const transfer=await getTreasuryTransfer(transferId);if(!transfer)throw new Error("Transfer not found");const debit=round(transfer.sentAmount+transfer.feeAmount);return ensureFinancialAuthorization({type:"TRANSFER",resourceId:transfer.id,reference:transfer.reference,description:`Transfert interne ${transfer.fromCurrency} ${debit.toFixed(2)} vers ${transfer.toCurrency}`,amount:debit,currency:transfer.fromCurrency,requestedById,accountId:transfer.fromAccountId})}
export async function transferAuthorizationApproved(transferId:string){return financialAuthorizationApproved("TRANSFER",transferId)}
