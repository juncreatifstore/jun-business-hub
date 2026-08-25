"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission, type CurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getMailThreadState, saveMailThreadState, type MailWorkflowStatus } from "@/lib/mail-thread-state";
import { assertMailboxAccess, recordMailReliabilityEvent } from "@/lib/mail-security";
import { gmailArchiveThread, gmailRestoreThread, gmailSetThreadRead, gmailSetThreadStarred, gmailTrashThread } from "@/lib/google/gmail-thread-state";

async function threadOrRedirect(user:CurrentUser,threadId:string){
 const t=await prisma.mailThread.findUnique({where:{id:threadId},select:{id:true,gmailThreadId:true,mailAccountId:true}});
 if(!t)redirect("/app/mail?toast_error=Thread not found");
 try{await assertMailboxAccess(user,t.mailAccountId);}catch{redirect("/app/mail?toast_error=You do not have access to this mailbox");}
 return t;
}
function back(t:{id:string;mailAccountId:string},msg:string,folder="INBOX"){redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&folder=${folder}&thread=${t.id}&toast=${encodeURIComponent(msg)}`);}
function folderBack(t:{mailAccountId:string},folder:string,msg:string){redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&folder=${folder}&toast=${encodeURIComponent(msg)}`);}
async function gmailFailure(t:{id:string;mailAccountId:string},userId:string,error:unknown,folder="INBOX"):Promise<never>{
 const message=error instanceof Error?error.message:"Gmail action failed";
 await recordMailReliabilityEvent({type:"SYNC_ERROR",accountId:t.mailAccountId,threadId:t.id,userId,message});
 redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&folder=${folder}&thread=${t.id}&toast_error=${encodeURIComponent(message)}`);
}

export async function markMailThreadRead(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),state=await getMailThreadState(threadId);
 try{await gmailSetThreadRead(t.mailAccountId,t.gmailThreadId,true);}catch(e){return gmailFailure(t,user.id,e,folder);}
 await saveMailThreadState({...state,isRead:true,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_MARK_READ",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,"Marked as read",folder);
}
export async function markMailThreadUnread(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),state=await getMailThreadState(threadId);
 try{await gmailSetThreadRead(t.mailAccountId,t.gmailThreadId,false);}catch(e){return gmailFailure(t,user.id,e,folder);}
 await saveMailThreadState({...state,isRead:false,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_MARK_UNREAD",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,"Marked as unread",folder);
}
export async function toggleMailThreadStar(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),state=await getMailThreadState(threadId),starred=!state.starred;
 try{await gmailSetThreadStarred(t.mailAccountId,t.gmailThreadId,starred);}catch(e){return gmailFailure(t,user.id,e,folder);}
 await saveMailThreadState({...state,starred,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:starred?"EMAIL_STAR":"EMAIL_UNSTAR",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,starred?"Starred in Gmail":"Star removed in Gmail",folder);
}
export async function archiveMailThread(threadId:string){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),state=await getMailThreadState(threadId);
 try{await gmailArchiveThread(t.mailAccountId,t.gmailThreadId);}catch(e){return gmailFailure(t,user.id,e);}
 await saveMailThreadState({...state,archived:true,trashed:false,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_ARCHIVE",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");folderBack(t,"INBOX","Conversation archived in Gmail");
}
export async function trashMailThread(threadId:string){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),state=await getMailThreadState(threadId);
 try{await gmailTrashThread(t.mailAccountId,t.gmailThreadId);}catch(e){return gmailFailure(t,user.id,e);}
 await saveMailThreadState({...state,trashed:true,archived:false,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_TRASH",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");folderBack(t,"TRASH","Conversation moved to Gmail trash");
}
export async function restoreMailThread(threadId:string,folder="INBOX"){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),state=await getMailThreadState(threadId);
 try{await gmailRestoreThread(t.mailAccountId,t.gmailThreadId);}catch(e){return gmailFailure(t,user.id,e,folder);}
 await saveMailThreadState({...state,trashed:false,archived:false,snoozedUntil:null,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_RESTORE",resourceType:"MailThread",resourceId:threadId});revalidatePath("/app/mail");back(t,"Conversation restored to Gmail inbox",folder);
}
export async function snoozeMailThread(threadId:string,formData:FormData){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),hours=Math.min(720,Math.max(1,Number(formData.get("hours")||24))),state=await getMailThreadState(threadId),snoozedUntil=new Date(Date.now()+hours*3600000).toISOString();
 await saveMailThreadState({...state,snoozedUntil,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_SNOOZE",resourceType:"MailThread",resourceId:threadId,after:{snoozedUntil,scope:"JUN_LOCAL"}});revalidatePath("/app/mail");folderBack(t,"SNOOZED","Conversation snoozed in JUN");
}
export async function setMailWorkflowStatus(threadId:string,formData:FormData){
 const user=await assertPermission("EMAIL_READ"),t=await threadOrRedirect(user,threadId),value=String(formData.get("workflowStatus")||"") as MailWorkflowStatus;
 if(!["OPEN","WAITING_CLIENT","WAITING_INTERNAL","RESOLVED"].includes(value))redirect(`/app/mail?mailbox=${encodeURIComponent(t.mailAccountId)}&thread=${threadId}&toast_error=Invalid conversation status`);
 const state=await getMailThreadState(threadId);await saveMailThreadState({...state,workflowStatus:value,updatedAt:new Date().toISOString(),updatedById:user.id});
 await audit({userId:user.id,action:"EMAIL_WORKFLOW_STATUS",resourceType:"MailThread",resourceId:threadId,after:{workflowStatus:value}});revalidatePath("/app/mail");back(t,`Status changed to ${value.replaceAll("_"," ")}`);
}
