import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";
import { renderFinancialMovementReceiptPdf } from "@/services/pdf/finance-documents";
import { audit } from "@/lib/audit";

export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:{id:string}}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="CLIENT"&&!can(user,"PAYMENT_READ"))return NextResponse.json({error:"Forbidden"},{status:403});
  const receipt=await getUniversalFinancialReceipt(params.id);if(!receipt)return NextResponse.json({error:"Receipt not found"},{status:404});
  if(user.role==="CLIENT"){const account=await prisma.clientAccount.findUnique({where:{userId:user.id},select:{clientId:true}});if(!account||account.clientId!==receipt.clientId)return NextResponse.json({error:"Forbidden"},{status:403});}
  const client=receipt.clientId?await prisma.client.findUnique({where:{id:receipt.clientId},select:{firstName:true,lastName:true,internalId:true}}):null;
  const bytes=await renderFinancialMovementReceiptPdf({receiptNumber:receipt.receiptNumber,title:receipt.title,clientName:client?`${client.firstName} ${client.lastName}`:"Financial account",clientId:client?.internalId||"-",amount:receipt.amount,currency:receipt.currency,direction:receipt.direction,status:receipt.status,description:receipt.description,method:receipt.method,transactionReference:receipt.transactionReference,sourceType:receipt.sourceType,issuedAt:new Date(receipt.issuedAt)});
  await audit({userId:user.id,action:"FINANCIAL_RECEIPT_DOWNLOAD",resourceType:"UniversalFinancialReceipt",resourceId:receipt.id,after:{receiptNumber:receipt.receiptNumber,sourceType:receipt.sourceType,sourceId:receipt.sourceId}});
  return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename=\"${receipt.receiptNumber}.pdf\"`,"Cache-Control":"private, no-store"}});
}
