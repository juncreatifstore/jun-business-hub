"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getMailThreadState, saveMailThreadState, type MailWorkflowStatus } from "@/lib/mail-thread-state";
import { markGmailRead } from "@/lib/google/gmail";

async function threadOrRedirect(threadId:string){const t=await prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,gmailThreadId:true,mailAccountId:true}});if(!t)redirect("/app/mail?toast_error=Thread not found");return t;}
function back(t:{id:string;mailAccountId:string},msg:string,folder="INBOX"){redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&folder=${folder}&thread=${t.id}&toast=${encodeURIComponent(msg)}`);}
function folderBack(t:{mailAccountId:string},folder:string,msg:string){redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&folder=${folder}&toast=${encodeURIComponent(msg)}`);}

export async function markMailThreadRead(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const state=await getMailThreadState(threadId);await saveMailThreadState({...state,isRead:true,updatedAt:new Date().toISOString(),updatedById:user.id});
 await markGmailRead(t.mailAccountId,t.gmailThreadId).catch(()=>null);await audit({userId:user.id,action:"EMAIL_MARK_READ",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,"Marked as read",folder);
}
export async function toggleMailThreadStar(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const state=await getMailThreadState(threadId);const next={...state,starred:!state.starred,updatedAt:new Date().toISOString(),updatedById:user.id};await saveMailThreadState(next);await audit({userId:user.id,action:next.starred?"EMAIL_STAR":"EMAIL_UNSTAR",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,next.starred?"Starred":"Star removed",folder);
}
export async function archiveMailThread(threadId:string){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const state=await getMailThreadState(threadId);await saveMailThreadState({...state,archived:true,trashed:false,updatedAt:new Date().toISOString(),updatedById:user.id});await audit({userId:user.id,action:"EMAIL_ARCHIVE",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");folderBack(t,"INBOX","Conversation archived");
}
export async function trashMailThread(threadId:string){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const state=await getMailThreadState(threadId);await saveMailThreadState({...state,trashed:true,archived:false,updatedAt:new Date().toISOString(),updatedById:user.id});await audit({userId:user.id,action:"EMAIL_TRASH",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");folderBack(t,"TRASH","Conversation moved to trash");
}
export async function restoreMailThread(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const state=await getMailThreadState(threadId);await saveMailThreadState({...state,trashed:false,archived:false,snoozedUntil:null,updatedAt:new Date().toISOString(),updatedById:user.id});await audit({userId:user.id,action:"EMAIL_RESTORE",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,"Conversation restored",folder);
}
export async function snoozeMailThread(threadId:string,formData:FormData){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const hours=Math.min(720,Math.max(1,Number(formData.get("hours")||24)));const state=await getMailThreadState(threadId);const snoozedUntil=new Date(Date.now()+hours*3600000).toISOString();await saveMailThreadState({...state,snoozedUntil,updatedAt:new Date().toISOString(),updatedById:user.id});await audit({userId:user.id,action:"EMAIL_SNOOZE",resourceType:"MailThread",resourceId:threadId,after:{snoozedUntil}});revalidatePath("/app/mail");folderBack(t,"SNOOZED","Conversation snoozed");
}
export async function setMailWorkflowStatus(threadId:string,formData:FormData){
 const user=await assertPermission("EMAIL_READ");const t=await threadOrRedirect(threadId);const value=String(formData.get("workflowStatus")||"") as MailWorkflowStatus;if(!["OPEN","WAITING_CLIENT","WAITING_INTERNAL","RESOLVED"].includes(value))redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&thread=${threadId}&toast_error=Invalid conversation status`);const state=await getMailThreadState(threadId);await saveMailThreadState({...state,workflowStatus:value,updatedAt:new Date().toISOString(),updatedById:user.id});await audit({userId:user.id,action:"EMAIL_WORKFLOW_STATUS",resourceType:"MailThread",resourceId:threadId,after:{workflowStatus:value}});revalidatePath("/app/mail");back(t,`Status changed to ${value.replaceAll("_"," ")}`);
}
