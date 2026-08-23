import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { getCaseReport } from "@/lib/case-report";
import { renderCaseReport } from "@/services/pdf/case-report";

export const dynamic="force-dynamic";

export async function GET(_req:Request,{params}:{params:{id:string}}){
 const user=await getCurrentUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!can(user,"CASE_READ"))return NextResponse.json({error:"Forbidden"},{status:403});
 const report=await getCaseReport(params.id);
 if(!report)return NextResponse.json({error:"Not found"},{status:404});
 const bytes=await renderCaseReport(report);
 const filename=`${report.case.caseNumber}-case-report.pdf`.replace(/[^a-zA-Z0-9._-]/g,"-");
 return new NextResponse(Buffer.from(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`inline; filename="${filename}"`,"Cache-Control":"private, no-store"}});
}
