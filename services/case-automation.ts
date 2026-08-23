"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { getCaseAutomationConfig, getCaseAutomationPlan, saveCaseAutomationConfig, saveCaseAutomationRun } from "@/lib/case-automation";

function path(caseId:string,msg?:string,error=false){return `/app/cases/${caseId}/automation${msg?`?${error?"toast_error":"toast"}=${encodeURIComponent(msg)}`:""}`;}

export async function updateCaseAutomationSettings(caseId:string,formData:FormData){
 const user=await assertPermission("CASE_UPDATE");
 const c=await prisma.case.findUnique({where:{id:caseId},select:{id:true}});
 if(!c)redirect("/app/cases?toast_error=Case%20not%20found");
 const config={
  caseId,
  enabled:formData.get("enabled")==="on",
  createFollowUpTasks:formData.get("createFollowUpTasks")==="on",
  escalatePriority:formData.get("escalatePriority")==="on",
  notifyOwner:formData.get("notifyOwner")==="on",
  updatedAt:new Date().toISOString(),
  updatedById:user.id,
 };
 await saveCaseAutomationConfig(config);
 await audit({userId:user.id,action:"CASE_AUTOMATION_SETTINGS_UPDATED",resourceType:"Case",resourceId:caseId,after:config});
 revalidatePath(`/app/cases/${caseId}/automation`);
 redirect(path(caseId,"Automation settings saved"));
}

export async function runCaseSafeAutomation(caseId:string){
 const user=await assertPermission("CASE_UPDATE");
 const plan=await getCaseAutomationPlan(caseId);
 if(!plan)redirect("/app/cases?toast_error=Case%20not%20found");
 const {intelligence,config,candidates,targetPriority}=plan;
 if(!config.enabled)redirect(path(caseId,"Automation is disabled for this Case.",true));
 const c=await prisma.case.findUnique({where:{id:caseId},select:{id:true,caseNumber:true,clientId:true,ownerId:true,priority:true,status:true}});
 if(!c)redirect("/app/cases?toast_error=Case%20not%20found");
 if(["COMPLETED","CANCELLED","ARCHIVED"].includes(c.status))redirect(path(caseId,"Closed or archived Cases cannot run automation.",true));

 let tasksCreated=0,tasksSkipped=0;
 const actions:string[]=[];
 if(config.createFollowUpTasks){
  for(const candidate of candidates){
   if(candidate.alreadyExists){tasksSkipped++;continue;}
   const task=await prisma.task.create({data:{
    title:candidate.title,
    description:`Automatically proposed from Case Intelligence.\n\nRisk: ${candidate.insight.severity} · ${candidate.insight.area}\nFinding: ${candidate.insight.title}\n${candidate.insight.detail}\n\nRequired action: ${candidate.insight.action}`,
    caseId,
    clientId:c.clientId,
    assigneeId:c.ownerId,
    creatorId:user.id,
    priority:candidate.priority,
    status:"TODO",
    dueDate:candidate.dueDate,
   }});
   tasksCreated++;
   actions.push(`Created task: ${task.title}`);
   if(config.notifyOwner&&c.ownerId&&c.ownerId!==user.id){
    await prisma.notification.create({data:{userId:c.ownerId,type:"TASK_ASSIGNED",title:"Case automation assigned a follow-up",body:task.title}});
   }
   await logActivity({type:"TASK_CREATED",message:`Safe Automation created task: ${task.title}`,userId:user.id,clientId:c.clientId,caseId});
  }
 }

 let priorityAfter=c.priority;
 if(config.escalatePriority&&targetPriority!==c.priority){
  const updated=await prisma.case.update({where:{id:caseId},data:{priority:targetPriority as never}});
  priorityAfter=updated.priority;
  actions.push(`Escalated Case priority from ${c.priority} to ${updated.priority}`);
  await logActivity({type:"CASE_UPDATED",message:`Safe Automation escalated Case priority ${c.priority} → ${updated.priority}`,userId:user.id,clientId:c.clientId,caseId});
 }

 const run={id:randomUUID(),caseId,ranAt:new Date().toISOString(),ranById:user.id,riskScore:intelligence.score,riskLevel:intelligence.riskLevel,tasksCreated,tasksSkipped,priorityBefore:c.priority,priorityAfter,actions};
 await saveCaseAutomationRun(run);
 await audit({userId:user.id,action:"CASE_SAFE_AUTOMATION_RUN",resourceType:"Case",resourceId:caseId,after:{runId:run.id,riskScore:run.riskScore,riskLevel:run.riskLevel,tasksCreated,tasksSkipped,priorityBefore:c.priority,priorityAfter,actions}});
 revalidatePath(`/app/cases/${caseId}/automation`);
 revalidatePath(`/app/cases/${caseId}/operations`);
 revalidatePath(`/app/cases/${caseId}/intelligence`);
 revalidatePath(`/app/cases/${caseId}/dashboard`);
 redirect(path(caseId,`Automation completed: ${tasksCreated} task(s) created, ${tasksSkipped} duplicate(s) skipped.`));
}
