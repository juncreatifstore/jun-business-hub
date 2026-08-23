"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCaseClosureReadiness } from "@/lib/case-closure";

function closurePath(caseId:string,msg:string,error=false){return `/app/cases/${caseId}/closure?${error?"toast_error":"toast"}=${encodeURIComponent(msg)}`;}

export async function finalizeCaseClosure(caseId:string,formData:FormData){
 const user=await assertPermission("CASE_UPDATE");
 const readiness=await getCaseClosureReadiness(caseId);
 if(!readiness)redirect("/app/cases?toast_error=Case%20not%20found");
 if(["COMPLETED","CANCELLED","ARCHIVED"].includes(readiness.case.status))redirect(closurePath(caseId,"This Case is already in a terminal status and cannot be formally closed again.",true));
 if(!readiness.ready)redirect(closurePath(caseId,"Case cannot be closed until every required operational and financial item is settled.",true));
 const summary=String(formData.get("summary")||"").trim().slice(0,5000);
 if(summary.length<20)redirect(closurePath(caseId,"A professional final summary of at least 20 characters is required.",true));
 const expected=`CLOSE ${readiness.case.caseNumber}`.toUpperCase();
 if(String(formData.get("confirmation")||"").trim().toUpperCase()!==expected)redirect(closurePath(caseId,`Type ${expected} to confirm closure.`,true));
 const criticalReviewed=String(formData.get("criticalReviewed")||"")==="on";
 if(readiness.criticalCommunications.length&&!criticalReviewed)redirect(closurePath(caseId,"Critical communications must be explicitly reviewed before closure.",true));
 const beforeStatus=readiness.case.status;
 const closedAt=new Date().toISOString();
 const snapshot={
  caseId,caseNumber:readiness.case.caseNumber,clientId:readiness.case.clientId,closedAt,closedById:user.id,summary,criticalReviewed,
  operations:{tasksTotal:readiness.case.tasks.length,tasksDone:readiness.case.tasks.filter(t=>t.status==="DONE").length,milestonesTotal:readiness.operations.milestones.length,milestonesDone:readiness.operations.milestones.filter(m=>m.status==="DONE").length},
  documents:{official:readiness.case.documents.length,drive:readiness.case.files.length,final:readiness.finalDocuments.length},
  finance:readiness.finance.summaries.map(s=>({currency:s.currency,billed:s.billed,invoicePaid:s.invoicePaid,receivable:s.receivable,refundsPaid:s.refundsPaid,expensePaid:s.expensePaid,realizedProfit:s.realizedProfit,forecastProfit:s.forecastProfit})),
 };
 const closureKey=`case.closure.${caseId}`;
 await prisma.$transaction(async tx=>{
  const current=await tx.case.findUnique({where:{id:caseId},select:{status:true}});
  if(!current||["COMPLETED","CANCELLED","ARCHIVED"].includes(current.status))throw new Error("CASE_TERMINAL");
  await tx.appSetting.upsert({where:{key:closureKey},create:{key:closureKey,value:JSON.stringify(snapshot)},update:{value:JSON.stringify(snapshot)}});
  await tx.case.update({where:{id:caseId},data:{status:"COMPLETED"}});
 }).catch(error=>{
  if((error as Error)?.message==="CASE_TERMINAL")redirect(closurePath(caseId,"This Case changed to a terminal status before closure completed. Refresh and review the Case.",true));
  throw error;
 });
 await audit({userId:user.id,action:"CASE_FINAL_CLOSURE",resourceType:"Case",resourceId:caseId,before:{status:beforeStatus},after:JSON.parse(JSON.stringify(snapshot))});
 await logActivity({type:"CASE_UPDATED",message:`Case ${readiness.case.caseNumber} formally closed after final review`,userId:user.id,clientId:readiness.case.clientId,caseId});
 revalidatePath(`/app/cases/${caseId}`);revalidatePath(`/app/cases/${caseId}/dashboard`);revalidatePath(`/app/cases/${caseId}/closure`);revalidatePath(`/app/clients/${readiness.case.clientId}/services`);
 redirect(closurePath(caseId,"Case formally closed and final snapshot preserved"));
}
