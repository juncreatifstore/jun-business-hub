"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { getMailIntelligence } from "@/lib/mail-intelligence";
import { getMailSlaState, saveMailAutomationRun, saveMailSlaConfig, setMailOwnerId } from "@/lib/mail-operations";

const TASK_KEY_PREFIX="mail.auto.task.";
function taskKey(threadId:string){return `${TASK_KEY_PREFIX}${threadId}`;}
function back(message:string,error=false):never{redirect(`/app/mail/operations?${error?"toast_error":"toast"}=${encodeURIComponent(message)}`);}

export async function assignMailOwner(threadId:string,formData:FormData):Promise<void>{
 const user=await assertPermission("EMAIL_DRAFT");
 const ownerId=String(formData.get("ownerId")??"").trim()||null;
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,subject:true}});if(!thread)back("Conversation not found",true);
 let ownerName:string|null=null;
 if(ownerId){const owner=await prisma.user.findFirst({where:{id:ownerId,status:"ACTIVE",role:{not:"CLIENT"}},select:{id:true,firstName:true,lastName:true}});if(!owner)back("Selected owner is not an active staff member",true);ownerName=`${owner.firstName} ${owner.lastName}`;}
 await setMailOwnerId(threadId,ownerId);
 if(ownerId&&ownerId!==user.id)await prisma.notification.create({data:{userId:ownerId,type:"TASK_ASSIGNED",title:"Mail conversation assigned to you",body:thread.subject??"Mail conversation"}}).catch(()=>null);
 await audit({userId:user.id,action:"MAIL_OWNER_ASSIGNED",resourceType:"MailThread",resourceId:threadId,after:{ownerId,ownerName}});
 revalidatePath("/app/mail");revalidatePath("/app/mail/operations");back(ownerId?`Conversation assigned to ${ownerName}`:"Conversation unassigned");
}

export async function updateMailSlaConfig(formData:FormData):Promise<void>{
 const user=await assertPermission("SETTINGS_MANAGE");
 const n=(k:string,min:number,max:number)=>Math.max(min,Math.min(max,Number(formData.get(k))||min));
 const config={URGENT:n("URGENT",1,24),HIGH:n("HIGH",1,48),MEDIUM:n("MEDIUM",1,96),LOW:n("LOW",1,168)};
 await saveMailSlaConfig(config);
 await audit({userId:user.id,action:"MAIL_SLA_CONFIG_UPDATED",resourceType:"AppSetting",resourceId:"mail.sla.config",after:config});
 revalidatePath("/app/mail/operations");back("Mail SLA configuration updated");
}

export async function runMailSafeAutomation(threadId:string):Promise<void>{
 const user=await assertPermission("TASK_CREATE");
 const [thread,intel,sla]=await Promise.all([
  prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,subject:true,clientId:true}}),getMailIntelligence(threadId),getMailSlaState(threadId),
 ]);
 if(!thread||!intel||!sla)back("Mail automation context is incomplete",true);
 if(!intel.needsReply&&sla.status!=="OVERDUE")back("No safe automation action is currently required",true);
 const ownerRow=await prisma.appSetting.findUnique({where:{key:`mail.owner.${threadId}`},select:{value:true}});const ownerId=ownerRow?.value||null;
 const due=sla.dueAt?new Date(sla.dueAt):new Date(Date.now()+4*60*60*1000);
 const taskPriority=intel.priority==="URGENT"?"URGENT":intel.priority==="HIGH"?"HIGH":"MEDIUM";
 let createdTaskId:string|undefined;let duplicate=false;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const result=await prisma.$transaction(async tx=>{
    const marker=await tx.appSetting.findUnique({where:{key:taskKey(threadId)},select:{value:true}});
    if(marker?.value){const existing=await tx.task.findUnique({where:{id:marker.value},select:{id:true,status:true}});if(existing&&!["DONE","CANCELLED"].includes(existing.status))return {id:existing.id,duplicate:true};}
    const t=await tx.task.create({data:{title:`[MAIL:AUTO:${threadId}] Follow up: ${(thread.subject??"Mail conversation").slice(0,150)}`,description:`Safe Mail Automation follow-up. Category: ${intel.category}. Priority: ${intel.priority}. SLA: ${sla.status}. This task does not authorize payment, refund, legal, visa, or travel decisions.`,clientId:thread.clientId,assigneeId:ownerId,creatorId:user.id,priority:taskPriority as never,status:"TODO",dueDate:due}});
    await tx.appSetting.upsert({where:{key:taskKey(threadId)},create:{key:taskKey(threadId),value:t.id},update:{value:t.id}});
    return {id:t.id,duplicate:false};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
   createdTaskId=result.id;duplicate=result.duplicate;break;
  }catch(e){if(attempt===2)throw e;}
 }
 if(!createdTaskId)back("Could not create follow-up task",true);
 if(ownerId&&!duplicate)await prisma.notification.create({data:{userId:ownerId,type:"TASK_ASSIGNED",title:"Mail SLA follow-up",body:thread.subject??"Mail conversation"}}).catch(()=>null);
 const actions=[duplicate?"Existing active follow-up task reused":"Follow-up task created",ownerId?"Owner notified":"Conversation remains unassigned"];
 const run={id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,threadId,ranAt:new Date().toISOString(),actions,createdTaskId,notifiedOwnerId:ownerId||undefined};
 await saveMailAutomationRun(run);
 await audit({userId:user.id,action:"MAIL_SAFE_AUTOMATION_RUN",resourceType:"MailThread",resourceId:threadId,after:{...run,category:intel.category,priority:intel.priority,sla:sla.status}});
 await logActivity({type:"TASK_CREATED",message:`Mail automation follow-up: ${thread.subject??"Mail conversation"}`,userId:user.id,clientId:thread.clientId,caseId:null});
 revalidatePath("/app/mail/operations");revalidatePath("/app/tasks");back(duplicate?"Existing active follow-up task reused":"Safe follow-up task created");
}
