"use server";

import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decideRefund } from "@/services/refunds";
import { ensureUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";

export async function decideRefundSafe(refundId: string, formData: FormData) {
  try {
    const user=await assertPermission("REFUND_APPROVE");
    const target=String(formData.get("status")||"");
    await decideRefund(refundId, formData);
    if(target==="APPROVED"){
      const refund=await prisma.refund.findUnique({where:{id:refundId},select:{id:true,refundNumber:true,clientId:true,amount:true,currency:true,reason:true,status:true}});
      if(refund&&refund.status==="APPROVED")await ensureUniversalFinancialReceipt({sourceType:"REFUND",sourceId:refund.id,clientId:refund.clientId,amount:Number(refund.amount),currency:refund.currency,direction:"DEBIT",title:"Refund / withdrawal approval receipt",description:refund.reason,status:refund.status,transactionReference:refund.refundNumber,issuedById:user.id});
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "The refund decision could not be completed.";
    redirect(`/app/finance/refunds/${refundId}?toast_error=${encodeURIComponent(message)}`);
  }
}
