"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { saveMailCaseContext, getMailCaseContext } from "@/lib/mail-case-context";
import { createCaseCommunication } from "@/lib/case-communications";

function back(threadId:string,mailbox:string,msg:string,error=false):never{redirect(`/app/mail?mailbox=${encodeURIComponent(mailbox)}&folder=INBOX&thread=${threadId}&${error?"toast_error":"toast"}=${encodeURIComponent(msg)}`);}

export async function updateMailClientCase(threadId:string,formData:FormData){
 const user=await assertPermission("EMAIL_READ");
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,mailAccountId:true,clientId:true,subject:true}});if(!thread)redirect("/app/mail?toast_error=Thread not found");
 const clientId=String(formData.get("clientId")||"").trim()||null;const caseId=String(formData.get("caseId")||"").trim()||null;
 if(clientId){const client=await prisma.client.findUnique({where:{id:clientId},select:{id:true}});if(!client)back(threadId,thread.mailAccountId,"Client not found",true);}
 if(caseId){const c=await prisma.case.findUnique({where:{id:caseId},select:{id:true,clientId:true,caseNumber:true}});if(!c)back(threadId,thread.mailAccountId,"Case not found",true);if(clientId&&c.clientId!==clientId)back(threadId,thread.mailAccountId,"Selected Case belongs to another client",true);if(!clientId){await prisma.mailThread.update({where:{id:threadId},data:{clientId:c.clientId}});} }
 if(clientId)await prisma.mailThread.update({where:{id:threadId},data:{clientId}});else if(!caseId)await prisma.mailThread.update({where:{id:threadId},data:{clientId:null}});
 await saveMailCaseContext({threadId,caseId,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_CONTEXT_LINK_UPDATED",resourceType:"MailThread",resourceId:threadId,before:{clientId:thread.clientId},after:{clientId,caseId}});
 if(caseId){const c=await prisma.case.findUnique({where:{id:caseId},select:{clientId:true,caseNumber:true}});if(c)await logActivity({type:"CASE_UPDATED",message:`Email linked to Case ${c.caseNumber}: ${thread.subject||"(no subject)"}`,userId:user.id,clientId:c.clientId,caseId});}
 revalidatePath("/app/mail");if(caseId)revalidatePath(`/app/cases/${caseId}/history`);back(threadId,thread.mailAccountId,"Mail context updated");
}

export async function createTaskFromMail(threadId:string,formData:FormData){
 const user=await assertPermission("TASK_CREATE");
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,mailAccountId:true,clientId:true,subject:true,snippet:true}});if(!thread)redirect("/app/mail?toast_error=Thread not found");
 const context=await getMailCaseContext(threadId);const caseId=context.caseId;
 const title=String(formData.get("title")||thread.subject||"Follow up email").trim().slice(0,240);const priority=String(formData.get("priority")||"MEDIUM").toUpperCase();
 if(!["LOW","MEDIUM","HIGH","URGENT"].includes(priority))back(threadId,thread.mailAccountId,"Invalid task priority",true);
 const dueRaw=String(formData.get("dueDate")||"").trim();const dueDate=dueRaw&&!Number.isNaN(new Date(dueRaw).getTime())?new Date(dueRaw):null;
 let clientId=thread.clientId;if(caseId){const c=await prisma.case.findUnique({where:{id:caseId},select:{clientId:true,ownerId:true,caseNumber:true}});if(!c)back(threadId,thread.mailAccountId,"Linked Case no longer exists",true);clientId=c.clientId;const task=await prisma.task.create({data:{title,description:`Created from JUN Mail\n\nSubject: ${thread.subject||"(no subject)"}\nPreview: ${thread.snippet||"—"}\nMail thread: ${thread.id}`,caseId,clientId,assigneeId:c.ownerId,creatorId:user.id,priority:priority as never,status:"TODO",dueDate}});if(task.assigneeId&&task.assigneeId!==user.id)await prisma.notification.create({data:{userId:task.assigneeId,type:"TASK_ASSIGNED",title:"Task created from JUN Mail",body:task.title}});await logActivity({type:"TASK_CREATED",message:`Task created from email: ${task.title}`,userId:user.id,clientId,caseId});await audit({userId:user.id,action:"EMAIL_CREATE_TASK",resourceType:"MailThread",resourceId:threadId,after:{taskId:task.id,caseId,priority}});revalidatePath(`/app/cases/${caseId}/operations`);revalidatePath("/app/tasks");back(threadId,thread.mailAccountId,"Task created from email");}
 const task=await prisma.task.create({data:{title,description:`Created from JUN Mail\n\nSubject: ${thread.subject||"(no subject)"}\nPreview: ${thread.snippet||"—"}\nMail thread: ${thread.id}`,clientId,creatorId:user.id,priority:priority as never,status:"TODO",dueDate}});await audit({userId:user.id,action:"EMAIL_CREATE_TASK",resourceType:"MailThread",resourceId:threadId,after:{taskId:task.id,clientId,priority}});revalidatePath("/app/tasks");back(threadId,thread.mailAccountId,"Task created from email");
}

export async function logMailToCaseTimeline(threadId:string,formData:FormData){
 const user=await assertPermission("CASE_UPDATE");
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},include:{account:true}});if(!thread)redirect("/app/mail?toast_error=Thread not found");
 const context=await getMailCaseContext(threadId);if(!context.caseId)back(threadId,thread.mailAccountId,"Link this email to a Case first",true);
 const c=await prisma.case.findUnique({where:{id:context.caseId},select:{id:true,clientId:true,caseNumber:true}});if(!c)back(threadId,thread.mailAccountId,"Linked Case not found",true);
 const direction=thread.fromEmail?.toLowerCase().includes(thread.account.email.toLowerCase())?"OUTBOUND":"INBOUND";
 const importance=String(formData.get("importance")||"NORMAL").toUpperCase();if(!["NORMAL","IMPORTANT","CRITICAL"].includes(importance))back(threadId,thread.mailAccountId,"Invalid importance",true);
 const summary=String(formData.get("summary")||thread.snippet||thread.aiSummary||"Email communication").trim().slice(0,5000);
 const row=await createCaseCommunication({caseId:c.id,clientId:c.clientId,channel:"EMAIL",direction,importance:importance as never,subject:(thread.subject||"(no subject)").slice(0,200),summary,contact:thread.fromEmail||thread.toEmails.join(", "),occurredAt:(thread.lastMessageAt||thread.updatedAt).toISOString(),createdById:user.id});
 await audit({userId:user.id,action:"EMAIL_LOGGED_TO_CASE",resourceType:"MailThread",resourceId:thread.id,after:{caseId:c.id,communicationId:row.id,importance}});await logActivity({type:"CASE_UPDATED",message:`Email logged to Case timeline: ${thread.subject||"(no subject)"}`,userId:user.id,clientId:c.clientId,caseId:c.id});
 revalidatePath(`/app/cases/${c.id}/history`);revalidatePath(`/app/cases/${c.id}/dashboard`);back(threadId,thread.mailAccountId,"Email added to Case timeline");
}
