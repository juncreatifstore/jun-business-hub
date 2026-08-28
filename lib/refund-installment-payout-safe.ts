import "server-only";

import { prisma } from "@/lib/prisma";
import { getRefundInstallmentMeta } from "@/lib/finance-refund-installments";
import { findAuthorizationForResource } from "@/lib/company-funds-approvals";
import { createFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";
import type { RefundStatus } from "@prisma/client";

function round(value:number){return Math.round((Number(value||0)+Number.EPSILON)*100)/100}

export type SafeRefundPayoutResult={
  duplicate:boolean;
  refundId:string;
  refundNumber:string;
  clientId:string;
  caseId:string|null;
  paymentId:string|null;
  amount:number;
  currency:string;
  newStatus:RefundStatus;
  method:string;
  transactionRef:string;
  proofFileId:string;
  authorizationId:string;
  paidAt:string;
};

export async function executeRefundInstallmentPayout(installmentId:string,userId:string):Promise<SafeRefundPayoutResult>{
  const initial=await prisma.refundInstallment.findUnique({where:{id:installmentId},include:{refund:true}});
  if(!initial)throw new Error("Refund installment not found");

  // Idempotent retries must succeed before authorization or closed-period checks.
  if(initial.status==="PAID"){
    const meta=await getRefundInstallmentMeta(installmentId);
    const authorization=await findAuthorizationForResource("REFUND",`installment:${installmentId}`);
    return{
      duplicate:true,refundId:initial.refundId,refundNumber:initial.refund.refundNumber,clientId:initial.refund.clientId,
      caseId:initial.refund.caseId,paymentId:initial.refund.paymentId,amount:Number(initial.amount),currency:initial.refund.currency,
      newStatus:initial.refund.status,method:meta.method||"",transactionRef:meta.transactionRef||"",proofFileId:meta.proofFileId||"",
      authorizationId:authorization?.id||"",paidAt:initial.paidAt?.toISOString()||new Date().toISOString(),
    };
  }
  if(!["APPROVED","PARTIALLY_PAID"].includes(initial.refund.status))throw new Error("Refund must be approved before payout");

  const meta=await getRefundInstallmentMeta(installmentId);
  if(!meta.method||!meta.transactionRef||!meta.proofFileId)throw new Error("Method, transaction reference and proof are required before payout");
  const proof=await prisma.file.findFirst({where:{id:meta.proofFileId,refundId:initial.refundId,archivedAt:null},select:{id:true}});
  if(!proof)throw new Error("Refund payout proof file not found");

  const resourceId=`installment:${installmentId}`;
  const authorization=await findAuthorizationForResource("REFUND",resourceId);
  if(!authorization||authorization.status!=="APPROVED")throw new Error("Approved financial authorization is required before refund payout");
  if(authorization.currency!==initial.refund.currency.toUpperCase()||Math.abs(authorization.amount-Number(initial.amount))>0.005)throw new Error("Financial authorization no longer matches this refund installment");

  const paidAt=new Date();
  await assertFinancialPeriodOpen(paidAt);
  const paidAtIso=paidAt.toISOString();

  // Evidence is idempotent by authorization. If the following DB transaction fails,
  // a retry reuses the same evidence and can safely finish the payout state change.
  await createFinancialExecutionEvidence({
    authorizationId:authorization.id,
    transactionReference:meta.transactionRef,
    proofFileId:proof.id,
    note:`${meta.method}${meta.notes?` · ${meta.notes}`:""}`,
    executedById:userId,
    executedAt:paidAtIso,
  });

  const result=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund-installment:${installmentId}`}))`;
    const current=await tx.refundInstallment.findUnique({where:{id:installmentId},include:{refund:{include:{installments:true}}}});
    if(!current)throw new Error("Refund installment not found");
    if(current.status==="PAID")return{duplicate:true,current,newStatus:current.refund.status as RefundStatus,paidAt:current.paidAt||paidAt};
    if(!["APPROVED","PARTIALLY_PAID"].includes(current.refund.status))throw new Error("Refund is no longer payable");

    const changed=await tx.refundInstallment.updateMany({where:{id:installmentId,status:current.status},data:{status:"PAID",paidAt}});
    if(changed.count!==1){
      const latest=await tx.refundInstallment.findUnique({where:{id:installmentId},include:{refund:true}});
      if(latest?.status==="PAID")return{duplicate:true,current:{...current,refund:latest.refund},newStatus:latest.refund.status as RefundStatus,paidAt:latest.paidAt||paidAt};
      throw new Error("Refund payout changed concurrently. Refresh and retry.");
    }

    const remaining=current.refund.installments.filter(i=>i.id!==installmentId&&!["PAID","CANCELLED"].includes(i.status)).length;
    const newStatus:RefundStatus=remaining===0?"PAID":"PARTIALLY_PAID";
    await tx.refund.update({where:{id:current.refundId},data:{status:newStatus}});

    if(current.refund.paymentId){
      const payment=await tx.payment.findUnique({where:{id:current.refund.paymentId},include:{refunds:{include:{installments:true}}}});
      if(payment){
        let paidTotal=0;
        for(const refund of payment.refunds){
          for(const installment of refund.installments){
            if(installment.status==="PAID"||installment.id===installmentId)paidTotal+=Number(installment.amount);
          }
        }
        const total=round(paidTotal);const paymentAmount=Number(payment.amount);
        if(total>0){const paymentStatus=total>=paymentAmount-0.005?"REFUNDED":"PARTIALLY_REFUNDED";if(payment.status!==paymentStatus)await tx.payment.update({where:{id:payment.id},data:{status:paymentStatus}});}
      }
    }
    return{duplicate:false,current,newStatus,paidAt};
  },{isolationLevel:"Serializable"});

  return{
    duplicate:result.duplicate,refundId:result.current.refundId,refundNumber:result.current.refund.refundNumber,
    clientId:result.current.refund.clientId,caseId:result.current.refund.caseId,paymentId:result.current.refund.paymentId,
    amount:Number(result.current.amount),currency:result.current.refund.currency,newStatus:result.newStatus,
    method:meta.method,transactionRef:meta.transactionRef,proofFileId:proof.id,authorizationId:authorization.id,paidAt:result.paidAt.toISOString(),
  };
}
