"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";

export async function syncAllMailboxes():Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 if(!(await rateLimitAsync(`gmail-sync-all:${user.id}`,2,60_000)))redirect("/app/mail?mailbox=ALL&toast_error=Sync all rate limit — wait a minute");
 const accounts=await prisma.mailAccount.findMany({where:{OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},orderBy:{createdAt:"asc"},select:{id:true,email:true}});
 if(!accounts.length)redirect("/app/mail?toast_error=No connected mailbox");
 const {syncFolder}=await import("@/lib/google/gmail");
 const {refreshMailboxIntelligence}=await import("@/lib/mail-intelligence");
 let total=0;
 const failures:string[]=[];
 const classified:Record<string,number>={};
 for(const account of accounts){
  try{
   let accountTotal=0;
   for(const folder of ["INBOX","SENT","DRAFTS","IMPORTANT"] as const)accountTotal+=await syncFolder(account.id,folder,25);
   total+=accountTotal;
   classified[account.id]=await refreshMailboxIntelligence(account.id,150);
  }catch{failures.push(account.email);}
 }
 await audit({userId:user.id,action:"GMAIL_SYNC_ALL",resourceType:"MailAccount",resourceId:null,after:{mailboxes:accounts.length,newThreads:total,failures,classified}});
 revalidatePath("/app/mail");
 revalidatePath("/app/mail/intelligence");
 if(failures.length)redirect(`/app/mail?mailbox=ALL&toast_error=${encodeURIComponent(`Sync completed with errors for ${failures.join(", ")}. ${total} new thread(s) imported.`)}`);
 redirect(`/app/mail?mailbox=ALL&toast=${encodeURIComponent(`All mailboxes synced — ${total} new thread${total===1?"":"s"}`)}`);
}
