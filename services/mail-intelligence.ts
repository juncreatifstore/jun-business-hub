"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getAccessibleMailboxIds, assertMailboxAccess } from "@/lib/mail-security";
import { classifyStoredThread, refreshMailboxIntelligence } from "@/lib/mail-intelligence";

export async function refreshAllMailIntelligence():Promise<void>{
 const user=await assertPermission("EMAIL_READ");
 if(!(await rateLimitAsync(`mail-intelligence-all:${user.id}`,4,60_000)))redirect("/app/mail/intelligence?toast_error=Intelligence refresh rate limit — wait a minute");
 const allowed=await getAccessibleMailboxIds(user,true);const accounts=allowed.length?await prisma.mailAccount.findMany({where:{id:{in:allowed},OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},select:{id:true,email:true}}):[];
 let total=0;const failures:string[]=[];for(const a of accounts)try{total+=await refreshMailboxIntelligence(a.id,200)}catch{failures.push(a.email)}
 await audit({userId:user.id,action:"MAIL_INTELLIGENCE_REFRESH_ALL",resourceType:"MailThread",resourceId:null,after:{mailboxes:accounts.length,classified:total,failures}});revalidatePath("/app/mail");revalidatePath("/app/mail/intelligence");
 if(failures.length)redirect(`/app/mail/intelligence?toast_error=${encodeURIComponent(`Classification completed with errors for ${failures.join(", ")}`)}`);redirect(`/app/mail/intelligence?toast=${encodeURIComponent(`${total} conversation(s) classified`)}`);
}
export async function refreshThreadMailIntelligence(threadId:string):Promise<void>{
 const user=await assertPermission("EMAIL_READ");const thread=await prisma.mailThread.findUnique({where:{id:threadId},select:{mailAccountId:true}});if(!thread)redirect("/app/mail/intelligence?toast_error=Thread not found");try{await assertMailboxAccess(user,thread.mailAccountId)}catch{redirect("/app/mail/intelligence?toast_error=Mailbox access denied")}
 const result=await classifyStoredThread(threadId);if(!result)redirect("/app/mail/intelligence?toast_error=Thread not found");await audit({userId:user.id,action:"MAIL_INTELLIGENCE_REFRESH_THREAD",resourceType:"MailThread",resourceId:threadId,after:{category:result.category,priority:result.priority,department:result.department,escalation:result.escalation,needsReply:result.needsReply}});revalidatePath("/app/mail");revalidatePath("/app/mail/intelligence");redirect(`/app/mail/intelligence?toast=${encodeURIComponent("Conversation reclassified")}`);
}
