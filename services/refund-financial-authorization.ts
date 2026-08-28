"use server";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ensureFinancialAuthorization } from "@/lib/company-funds-approvals";
import { executeRefundInstallmentPayout } from "@/lib/refund-installment-payout-safe";
import { confirmLegacyRefundFullyPaid } from "@/services/refund-legacy-settlement";

async function requireAuthorization(input:{resourceId:string;reference:string;description:string;amount:number;currency:string;requestedById:string}){
  const authorization=await ensureFinancialAuthorization({type:"REFUND",...input});
  if(authorization.status!=="APPROVED"){
    await audit({userId:input.requestedById,action:"REFUND_PAYOUT_AUTHORIZATION_REQUIRED",resourceType:"Refund",resourceId:input.resourceId,after:{authorizationId:authorization.id,amount:input.amount,currency:input.currency,requiredApprovals:authorization.requiredApprovals,reserveImpact:authorization.reserveImpact}});
    revalidatePath("/app/company-funds/authorizations");
    throw new Error(`Autorisation financière requise avant remboursement (${authorization.reference}).`);
  }
  return authorization;
}

export async function markRefundInstallmentPaidAuthorized(installmentId:string):Promise<void>{
  const user=await assertPermission("REFUND_APPROVE");
  const inst=await prisma.refundInstallment.findUnique({where:{id:installmentId},include:{refund:true}});if(!inst)throw new Error("Refund installment not found");
  // A completed retry returns before creating a new authorization or touching a closed period.
  if(inst.status==="PAID")return;
  await requireAuthorization({resourceId:`installment:${inst.id}`,reference:`${inst.refund.refundNumber}-${inst.number}`,description:`Paiement remboursement ${inst.refund.refundNumber} · tranche ${inst.number}`,amount:Number(inst.amount),currency:inst.refund.currency,requestedById:user.id});
  const result=await executeRefundInstallmentPayout(installmentId,user.id);
  if(!result.duplicate){
    await audit({userId:user.id,action:"REFUND_INSTALLMENT_PAID",resourceType:"RefundInstallment",resourceId:installmentId,after:{refund:result.refundNumber,amount:result.amount,currency:result.currency,newStatus:result.newStatus,method:result.method,transactionRef:result.transactionRef,proofFileId:result.proofFileId,authorizationId:result.authorizationId,paidAt:result.paidAt}});
    await logActivity({type:"REFUND_UPDATED",message:`Refund payment recorded on ${result.refundNumber} (${result.newStatus.replaceAll("_"," ")})`,userId:user.id,clientId:result.clientId,caseId:result.caseId});
  }
  revalidatePath(`/app/finance/refunds/${result.refundId}`);revalidatePath("/app/finance/refunds");revalidatePath("/app/finance/payments");
  revalidatePath(`/app/clients/${result.clientId}`);revalidatePath(`/app/clients/${result.clientId}/account`);revalidatePath(`/app/clients/${result.clientId}/statement`);
  if(result.paymentId)revalidatePath(`/app/finance/payments/${result.paymentId}`);
  revalidatePath("/app/company-funds/authorizations");revalidatePath("/app/company-funds/execution-evidence");revalidatePath("/app/company-funds/timeline");
}

export async function confirmLegacyRefundFullyPaidAuthorized(refundId:string,formData:FormData):Promise<void>{
  const user=await assertPermission("REFUND_APPROVE");
  const refund=await prisma.refund.findUnique({where:{id:refundId},select:{id:true,refundNumber:true,amount:true,currency:true}});if(!refund)throw new Error("Refund not found");
  await requireAuthorization({resourceId:`legacy:${refund.id}`,reference:refund.refundNumber,description:`Remboursement complet legacy ${refund.refundNumber}`,amount:Number(refund.amount),currency:refund.currency,requestedById:user.id});
  await confirmLegacyRefundFullyPaid(refundId,formData);
  revalidatePath(`/app/finance/refunds/${refundId}`);revalidatePath("/app/company-funds/authorizations");
}
