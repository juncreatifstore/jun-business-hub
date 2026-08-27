"use server";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ensureFinancialAuthorization } from "@/lib/company-funds-approvals";
import { markRefundInstallmentPaid } from "@/services/refunds";
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
  await requireAuthorization({resourceId:`installment:${inst.id}`,reference:`${inst.refund.refundNumber}-${inst.number}`,description:`Paiement remboursement ${inst.refund.refundNumber} · tranche ${inst.number}`,amount:Number(inst.amount),currency:inst.refund.currency,requestedById:user.id});
  await markRefundInstallmentPaid(installmentId);
  revalidatePath(`/app/finance/refunds/${inst.refundId}`);revalidatePath("/app/company-funds/authorizations");
}

export async function confirmLegacyRefundFullyPaidAuthorized(refundId:string,formData:FormData):Promise<void>{
  const user=await assertPermission("REFUND_APPROVE");
  const refund=await prisma.refund.findUnique({where:{id:refundId},select:{id:true,refundNumber:true,amount:true,currency:true}});if(!refund)throw new Error("Refund not found");
  await requireAuthorization({resourceId:`legacy:${refund.id}`,reference:refund.refundNumber,description:`Remboursement complet legacy ${refund.refundNumber}`,amount:Number(refund.amount),currency:refund.currency,requestedById:user.id});
  await confirmLegacyRefundFullyPaid(refundId,formData);
  revalidatePath(`/app/finance/refunds/${refundId}`);revalidatePath("/app/company-funds/authorizations");
}
