"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getAccessibleMailboxIds, recordMailReliabilityEvent } from "@/lib/mail-security";

export async function syncAllMailboxes():Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 if(!(await rateLimitAsync(`gmail-sync-all:${user.id}`,2,60_000)))redirect("/app/mail?mailbox=ALL&toast_error=Sync all rate limit — wait a minute");
 const allowedIds=await getAccessibleMailboxIds(user,true);
 const accounts=allowedIds.length?await prisma.mailAccount.findMany({where:{id:{in:allowedIds},OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},orderBy:{createdAt:"asc"},select:{id:true,email:true}}):[];
 if(!accounts.length)redirect("/app/mail?toast_error=No accessible connected mailbox");
 const {syncMailboxRecent}=await import("@/lib/google/gmail");
 const {refreshMailboxIntelligence}=await import("@/lib/mail-intelligence");
 let total=0;const failures:string[]=[];const classified:Record<string,number>={};
 for(const account of accounts){
  try{
   const accountTotal=await syncMailboxRecent(account.id,250);total+=accountTotal;
   classified[account.id]=await refreshMailboxIntelligence(account.id,250);
  }catch(e){failures.push(account.email);await recordMailReliabilityEvent({type:"SYNC_ERROR",accountId:account.id,userId:user.id,message:e instanceof Error?e.message:"Gmail sync failed"});}
 }
 await audit({userId:user.id,action:"GMAIL_SYNC_ALL",resourceType:"MailAccount",resourceId:null,after:{mailboxes:accounts.length,newThreads:total,failures,classified,maxPerFolder:250,paginated:true}});
 revalidatePath("/app/mail");revalidatePath("/app/mail/intelligence");revalidatePath("/app/mail/security");
 if(failures.length)redirect(`/app/mail?mailbox=ALL&toast_error=${encodeURIComponent(`Sync completed with errors for ${failures.join(", ")}. ${total} new thread(s) imported.`)}`);
 redirect(`/app/mail?mailbox=ALL&toast=${encodeURIComponent(`All accessible mailboxes synced — ${total} new thread${total===1?"":"s"}; recent labels refreshed`)}`);
}
