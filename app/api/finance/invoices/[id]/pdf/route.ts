import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvoice, invoiceFinancialState } from "@/lib/finance-invoices";
import { renderInvoicePdf } from "@/services/pdf/finance-documents";

export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:{id:string}}){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(!can(user,"INVOICE_READ"))return NextResponse.json({error:"Forbidden"},{status:403});
 const invoice=await getInvoice(params.id);if(!invoice)return NextResponse.json({error:"Not found"},{status:404});const state=await invoiceFinancialState(invoice);
 const [client,linkedCase]=await Promise.all([prisma.client.findUnique({where:{id:invoice.clientId},select:{firstName:true,lastName:true,internalId:true,email:true,phone:true,address:true,country:true}}),invoice.caseId?prisma.case.findUnique({where:{id:invoice.caseId},select:{caseNumber:true,title:true}}):Promise.resolve(null)]);if(!client)return NextResponse.json({error:"Client not found"},{status:404});
 const bytes=await renderInvoicePdf({invoiceNumber:invoice.invoiceNumber,title:invoice.title,status:state.effectiveStatus,clientName:`${client.firstName} ${client.lastName}`,clientId:client.internalId,email:client.email,phone:client.phone,address:[client.address,client.country].filter(Boolean).join(", "),caseLabel:linkedCase?`${linkedCase.caseNumber} - ${linkedCase.title}`:null,currency:invoice.currency,issueDate:new Date(invoice.issueDate),dueDate:new Date(invoice.dueDate),lines:invoice.lines,subtotal:invoice.subtotal,taxTotal:invoice.taxTotal,total:invoice.total,paid:state.paid,balance:state.balance,notes:invoice.notes,terms:invoice.terms});
 return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${invoice.invoiceNumber}.pdf"`,"Cache-Control":"private, no-store"}})
}
