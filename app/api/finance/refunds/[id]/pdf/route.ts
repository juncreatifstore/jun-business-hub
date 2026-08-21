import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { renderRefundPdf } from "@/services/pdf/finance-documents";

export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:{id:string}}){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(!can(user,"REFUND_READ"))return NextResponse.json({error:"Forbidden"},{status:403});
 const r=await prisma.refund.findUnique({where:{id:params.id},include:{client:true,case:true,payment:true,installments:{orderBy:{dueDate:"asc"}}}});if(!r)return NextResponse.json({error:"Not found"},{status:404});
 const paid=refundPaidTotal(r.installments),remaining=refundRemaining(r.amount,r.installments);const bytes=await renderRefundPdf({refundNumber:r.refundNumber,status:r.status,clientName:`${r.client.firstName} ${r.client.lastName}`,clientId:r.client.internalId,currency:r.currency,amount:Number(r.amount),paid,remaining,reason:r.reason,createdAt:r.createdAt,paymentReference:r.payment?.reference||null,caseNumber:r.case?.caseNumber||null,installments:r.installments.map(i=>({number:i.number,amount:Number(i.amount),dueDate:i.dueDate,status:i.status,paidAt:i.paidAt}))});
 return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${r.refundNumber}.pdf"`,"Cache-Control":"private, no-store"}})
}
