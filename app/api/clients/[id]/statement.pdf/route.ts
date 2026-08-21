import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount, type ClientStatementLanguage } from "@/lib/client-financial-account";
import { renderClientStatementPdf } from "@/services/pdf/finance-documents";

export const dynamic="force-dynamic";
export async function GET(req:NextRequest,{params}:{params:{id:string}}){
 const user=await getCurrentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 let allowed=can(user,"CLIENT_READ");if(user.role==="CLIENT"){const a=await prisma.clientAccount.findUnique({where:{userId:user.id},select:{clientId:true}});allowed=a?.clientId===params.id}if(!allowed)return NextResponse.json({error:"Forbidden"},{status:403});
 const [client,account]=await Promise.all([prisma.client.findUnique({where:{id:params.id},select:{internalId:true,firstName:true,lastName:true,email:true,phone:true,address:true,country:true}}),getClientFinancialAccount(params.id)]);if(!client)return NextResponse.json({error:"Not found"},{status:404});
 const q=String(req.nextUrl.searchParams.get("lang")||"").toUpperCase();const language:ClientStatementLanguage=["FR","EN","ES","HT"].includes(q)?q as ClientStatementLanguage:account.profile.preferredLanguage;
 const bytes=await renderClientStatementPdf({reference:`STATEMENT-${client.internalId}`,language,client:{name:`${client.firstName} ${client.lastName}`,internalId:client.internalId,email:client.email,phone:client.phone,address:client.address,country:client.country},balances:account.balances,entries:account.entries.map(e=>({date:e.date,reference:e.reference,description:e.description,status:e.status,currency:e.currency,credit:e.credit,debit:e.debit,runningBalance:e.runningBalance}))});
 return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${client.internalId}-statement.pdf"`,"Cache-Control":"private, no-store"}})
}
