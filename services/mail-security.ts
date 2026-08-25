"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { accessTokenFor } from "@/lib/google/gmail";
import { clearMailboxAccessRule, recordMailReliabilityEvent, saveMailboxAccessRule } from "@/lib/mail-security";

function securityPath(message:string,error=false){return `/app/mail/security?${error?"toast_error":"toast"}=${encodeURIComponent(message)}`;}

export async function updateUserMailboxAccess(userId:string,formData:FormData){
 const actor=await assertPermission("EMAIL_MANAGE");
 const target=await prisma.user.findUnique({where:{id:userId},select:{id:true,role:true,status:true,firstName:true,lastName:true}});
 if(!target||target.role==="CLIENT")redirect(securityPath("Staff user not found",true));
 const requested=[...new Set(formData.getAll("accountIds").map(v=>String(v)).filter(Boolean))];
 const existing=requested.length?await prisma.mailAccount.findMany({where:{id:{in:requested}},select:{id:true}}):[];
 if(existing.length!==requested.length)redirect(securityPath("One or more mailboxes no longer exist",true));
 const before=await prisma.appSetting.findUnique({where:{key:`mail.access.user.${userId}`},select:{value:true}});
 const rule=await saveMailboxAccessRule({userId,accountIds:requested,updatedById:actor.id});
 await audit({userId:actor.id,action:"MAILBOX_ACCESS_UPDATED",resourceType:"User",resourceId:userId,before:{rule:before?.value??null},after:{mailAccountIds:rule.accountIds,count:rule.accountIds.length}});
 revalidatePath("/app/mail/security");revalidatePath("/app/mail");redirect(securityPath(`Mailbox restriction saved for ${target.firstName} ${target.lastName}`));
}

export async function clearUserMailboxRestriction(userId:string){
 const actor=await assertPermission("EMAIL_MANAGE");
 const target=await prisma.user.findUnique({where:{id:userId},select:{id:true,role:true,firstName:true,lastName:true}});if(!target||target.role==="CLIENT")redirect(securityPath("Staff user not found",true));
 await clearMailboxAccessRule(userId);
 await audit({userId:actor.id,action:"MAILBOX_ACCESS_CLEARED",resourceType:"User",resourceId:userId,after:{mode:"LEGACY_FULL_ACCESS"}});
 revalidatePath("/app/mail/security");revalidatePath("/app/mail");redirect(securityPath(`Mailbox restriction cleared for ${target.firstName} ${target.lastName}`));
}

export async function probeMailboxHealth(accountId:string){
 const actor=await assertPermission("EMAIL_MANAGE");
 const account=await prisma.mailAccount.findUnique({where:{id:accountId},select:{id:true,email:true}});if(!account)redirect(securityPath("Mailbox not found",true));
 try{
  await accessTokenFor(accountId);
  await recordMailReliabilityEvent({type:"HEALTH_CHECK",accountId,userId:actor.id,message:"Mailbox credential health check succeeded"});
  await audit({userId:actor.id,action:"MAILBOX_HEALTH_CHECK",resourceType:"MailAccount",resourceId:accountId,after:{email:account.email,status:"SUCCESS"}});
  revalidatePath("/app/mail/security");redirect(securityPath(`${account.email} health check passed`));
 }catch(e){
  const message=e instanceof Error?e.message:"Mailbox health check failed";
  await recordMailReliabilityEvent({type:"TOKEN_ERROR",accountId,userId:actor.id,message});
  await audit({userId:actor.id,action:"MAILBOX_HEALTH_CHECK_FAILED",resourceType:"MailAccount",resourceId:accountId,after:{email:account.email,status:"FAILED"}});
  revalidatePath("/app/mail/security");redirect(securityPath(`${account.email}: ${message}`,true));
 }
}
