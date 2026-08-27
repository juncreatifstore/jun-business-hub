import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMonthlyFinancialClose, periodBounds } from "@/lib/company-funds-monthly-close";
import { prisma } from "@/lib/prisma";

export const dynamic="force-dynamic";

function csv(value:unknown){const s=typeof value==="string"?value:JSON.stringify(value??"");return `"${s.replace(/"/g,'""')}"`}

export async function GET(_request:Request,{params}:{params:{period:string}}){
  const user=await getCurrentUser();
  if(!user||user.role!=="SUPER_ADMIN")return NextResponse.json({ok:false,error:"Forbidden"},{status:403});
  const close=await getMonthlyFinancialClose(params.period);
  if(!close)return NextResponse.json({ok:false,error:"Monthly close not found"},{status:404});
  const {start,end}=periodBounds(params.period);
  const rows=await prisma.auditLog.findMany({
    where:{createdAt:{gte:start,lt:end},OR:[
      {resourceType:{contains:"Payment",mode:"insensitive"}},{resourceType:{contains:"Refund",mode:"insensitive"}},
      {resourceType:{contains:"Expense",mode:"insensitive"}},{resourceType:{contains:"Treasury",mode:"insensitive"}},
      {resourceType:{contains:"Financial",mode:"insensitive"}},{action:{contains:"COMPANY_FUNDS",mode:"insensitive"}},
      {action:{contains:"PAYMENT",mode:"insensitive"}},{action:{contains:"REFUND",mode:"insensitive"}},{action:{contains:"EXPENSE",mode:"insensitive"}}
    ]},
    orderBy:{createdAt:"asc"},take:10000,include:{user:{select:{firstName:true,lastName:true,email:true}}}
  });
  const lines=[
    ["period","status","audit_id","created_at","user","email","action","resource_type","resource_id","before","after"].map(csv).join(","),
    ...rows.map(r=>[close.period,close.status,r.id,r.createdAt.toISOString(),r.user?`${r.user.firstName} ${r.user.lastName}`:"System",r.user?.email||"",r.action,r.resourceType,r.resourceId||"",r.before,r.after].map(csv).join(","))
  ];
  return new NextResponse(lines.join("\n"),{status:200,headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="JUN-audit-${close.period}.csv"`,`Cache-Control":"no-store"`}});
}
