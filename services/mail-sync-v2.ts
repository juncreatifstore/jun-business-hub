"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import { assertMailboxAccess, getAccessibleMailboxIds, recordMailReliabilityEvent } from "@/lib/mail-security";
import { syncMailboxRecent } from "@/lib/google/gmail";
import { refreshGmailMailboxCache } from "@/lib/mail-gmail-cache";

const SYNC_LIMIT_PER_FOLDER=50;
const CACHE_LIMIT=100;

async function syncOne(accountId:string){
 const created=await syncMailboxRecent(accountId,SYNC_LIMIT_PER_FOLDER);
 await refreshGmailMailboxCache(accountId,CACHE_LIMIT);
 return {created,limitPerFolder:SYNC_LIMIT_PER_FOLDER,cacheLimit:CACHE_LIMIT};
}
function refresh(){revalidatePath("/app/mail");revalidatePath("/app/mail/intelligence");revalidatePath("/app/mail/operations");revalidatePath("/app/mail/security");}

export async function syncMailboxV2(accountId:string):Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 try{await assertMailboxAccess(user,accountId);}catch{redirect("/app/mail?toast_error=Vous n’avez pas accès à cette boîte mail");}
 if(!(await rateLimitAsync(`gmail-sync-v2:${user.id}`,6,60_000)))redirect(`/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=Synchronisation limitée — attendez une minute`);
 try{
  const result=await syncOne(accountId);
  await audit({userId:user.id,action:"GMAIL_SYNC",resourceType:"MailAccount",resourceId:accountId,after:{...result,scope:"INBOX_SENT_DRAFTS_IMPORTANT"}});refresh();
  redirect(`/app/mail?mailbox=${encodeURIComponent(accountId)}&folder=INBOX&category=PRIMARY&toast=${encodeURIComponent(`Synchronisation Gmail terminée — Inbox, Envoyés, Brouillons et Important actualisés`)}`);
 }catch(e){
  if(e&&typeof e==="object"&&"digest" in e)throw e;
  await recordMailReliabilityEvent({type:"SYNC_ERROR",accountId,userId:user.id,message:e instanceof Error?e.message:"Gmail sync failed"});refresh();
  redirect(`/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=${encodeURIComponent(e instanceof Error?e.message:"La synchronisation Gmail a échoué")}`);
 }
}

export async function syncAllMailboxesV2():Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 if(!(await rateLimitAsync(`gmail-sync-all-v2:${user.id}`,3,60_000)))redirect("/app/mail?mailbox=ALL&toast_error=Synchronisation limitée — attendez une minute");
 const ids=await getAccessibleMailboxIds(user,true);
 const accounts=ids.length?await prisma.mailAccount.findMany({where:{id:{in:ids}},select:{id:true,email:true}}):[];
 if(!accounts.length)redirect("/app/mail?toast_error=Aucune boîte Gmail connectée accessible");
 let created=0;const failures:string[]=[];
 for(const account of accounts){
  try{const r=await syncOne(account.id);created+=r.created;}
  catch(e){failures.push(account.email);await recordMailReliabilityEvent({type:"SYNC_ERROR",accountId:account.id,userId:user.id,message:e instanceof Error?e.message:"Gmail sync failed"});}
 }
 await audit({userId:user.id,action:"GMAIL_SYNC_ALL",resourceType:"MailAccount",resourceId:null,after:{created,failures,limitPerFolder:SYNC_LIMIT_PER_FOLDER,cacheLimit:CACHE_LIMIT,scope:"INBOX_SENT_DRAFTS_IMPORTANT"}});refresh();
 if(failures.length)redirect(`/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast_error=${encodeURIComponent(`Synchronisation terminée avec erreur pour : ${failures.join(", ")}`)}`);
 redirect(`/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast=${encodeURIComponent(`Toutes les boîtes Gmail ont été synchronisées`)}`);
}
