"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import { assertMailboxAccess, getAccessibleMailboxIds, recordMailReliabilityEvent } from "@/lib/mail-security";
import { syncFolder } from "@/lib/google/gmail";
import { refreshGmailMailboxCache } from "@/lib/mail-gmail-cache";

const FAST_SYNC_LIMIT=20;

async function syncOne(accountId:string){
 const created=await syncFolder(accountId,"INBOX",FAST_SYNC_LIMIT);
 await refreshGmailMailboxCache(accountId,FAST_SYNC_LIMIT);
 return {created,limit:FAST_SYNC_LIMIT};
}
function refresh(){revalidatePath("/app/mail");revalidatePath("/app/mail/intelligence");revalidatePath("/app/mail/operations");revalidatePath("/app/mail/security");}

export async function syncMailboxV2(accountId:string):Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 try{await assertMailboxAccess(user,accountId);}catch{redirect("/app/mail?toast_error=You do not have access to this mailbox");}
 if(!(await rateLimitAsync(`gmail-sync-v2:${user.id}`,6,60_000)))redirect(`/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=Sync rate limit — wait a minute`);
 try{
  const result=await syncOne(accountId);
  await audit({userId:user.id,action:"GMAIL_FAST_SYNC",resourceType:"MailAccount",resourceId:accountId,after:{...result,scope:"LATEST_INBOX_ONLY"}});refresh();
  redirect(`/app/mail?mailbox=${encodeURIComponent(accountId)}&folder=INBOX&category=PRIMARY&toast=${encodeURIComponent(`Fast sync complete — latest ${FAST_SYNC_LIMIT} Gmail conversations refreshed`)}`);
 }catch(e){
  if(e&&typeof e==="object"&&"digest" in e)throw e;
  await recordMailReliabilityEvent({type:"SYNC_ERROR",accountId,userId:user.id,message:e instanceof Error?e.message:"Gmail sync failed"});refresh();
  redirect(`/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=${encodeURIComponent(e instanceof Error?e.message:"Gmail sync failed")}`);
 }
}

export async function syncAllMailboxesV2():Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 if(!(await rateLimitAsync(`gmail-sync-all-v2:${user.id}`,3,60_000)))redirect("/app/mail?mailbox=ALL&toast_error=Sync all rate limit — wait a minute");
 const ids=await getAccessibleMailboxIds(user,true);
 const accounts=ids.length?await prisma.mailAccount.findMany({where:{id:{in:ids}},select:{id:true,email:true}}):[];
 if(!accounts.length)redirect("/app/mail?toast_error=No accessible connected mailbox");
 let created=0;const failures:string[]=[];
 for(const account of accounts){
  try{const r=await syncOne(account.id);created+=r.created;}
  catch(e){failures.push(account.email);await recordMailReliabilityEvent({type:"SYNC_ERROR",accountId:account.id,userId:user.id,message:e instanceof Error?e.message:"Gmail sync failed"});}
 }
 await audit({userId:user.id,action:"GMAIL_FAST_SYNC_ALL",resourceType:"MailAccount",resourceId:null,after:{created,failures,limitPerMailbox:FAST_SYNC_LIMIT,scope:"LATEST_INBOX_ONLY"}});refresh();
 if(failures.length)redirect(`/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast_error=${encodeURIComponent(`Fast sync completed with errors for ${failures.join(", ")}`)}`);
 redirect(`/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast=${encodeURIComponent(`Fast sync complete — latest ${FAST_SYNC_LIMIT} Gmail conversations per mailbox refreshed`)}`);
}
