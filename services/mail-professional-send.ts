"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { gmailSendAdvanced } from "@/lib/google/gmail-advanced-send";
import { deleteMailComposeMeta, getMailComposeMeta, listMailSignatures } from "@/lib/mail-compose-meta";
import { approvalIsCurrent, computeMailDraftHash, getMailApproval, markMailApprovalSent } from "@/lib/mail-approval";
import { acquireMailSendLock, assertMailboxAccess, markMailSendFailure, markMailSendSuccess } from "@/lib/mail-security";
import { findBannedClientByEmail, getClientCommunicationBan, isClientCommunicationBanned } from "@/lib/client-communication-policy";

export async function sendProfessionalDraft(threadId:string){
 const user=await assertPermission("EMAIL_SEND");
 const thread=await prisma.mailThread.findUnique({where:{id:threadId},include:{account:true}});if(!thread||!thread.aiDraft)redirect("/app/mail?toast_error=Professional draft not found");
 await assertMailboxAccess(user,thread.mailAccountId);
 const meta=await getMailComposeMeta(threadId);if(!meta)redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent("This is not a professional draft")}`);
 if(thread.clientId&&await isClientCommunicationBanned(thread.clientId)){
  const ban=await getClientCommunicationBan(thread.clientId);
  redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent(`Client banni — email bloqué partout dans JUN${ban.reason?`: ${ban.reason}`:""}`)}`);
 }
 for(const email of [...meta.to,...meta.cc,...meta.bcc]){
  const banned=await findBannedClientByEmail(email);
  if(banned)redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent(`Destinataire banni — aucun email ne peut être envoyé à ${email}`)}`);
 }
 if(thread.aiLevel!=="AUTO"){
  const approval=await getMailApproval(threadId),valid=await approvalIsCurrent(threadId);
  if(!valid)redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent(approval?.status==="APPROVED"?"Draft changed after approval — submit the new version for approval":"This email requires approval before sending")}`);
 }
 const accountConnected=Boolean(thread.account.accessTokenEnc||thread.account.refreshTokenEnc);if(!accountConnected)redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent("Mailbox is disconnected")}`);
 let text=thread.aiDraft;
 if(meta.signatureId){const sig=(await listMailSignatures(thread.mailAccountId)).find(s=>s.id===meta.signatureId);if(sig&&sig.body&&!text.includes(sig.body))text=`${text}\n\n${sig.body}`;}
 const files=meta.attachmentFileIds.length?await prisma.file.findMany({where:{id:{in:meta.attachmentFileIds},isVault:false,archivedAt:null},select:{id:true,name:true,mimeType:true,sizeBytes:true,storageKey:true}}):[];
 if(files.length!==meta.attachmentFileIds.length)redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent("One or more attachments are no longer available")}`);
 const total=files.reduce((n,f)=>n+f.sizeBytes,0);if(total>20*1024*1024)redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent("Attachments exceed the 20 MB JUN Mail limit")}`);
 const attachments=[] as {filename:string;mimeType:string;data:Buffer}[];for(const f of files)attachments.push({filename:f.name,mimeType:f.mimeType,data:await storage().download(f.storageKey)});
 let gmailThreadId:string|undefined;const sourceMessageId=meta.sourceGmailMessageId||undefined;if(meta.sourceThreadId){const source=await prisma.mailThread.findUnique({where:{id:meta.sourceThreadId},select:{gmailThreadId:true,mailAccountId:true}});if(source&&source.mailAccountId===thread.mailAccountId)gmailThreadId=source.gmailThreadId;}
 const fingerprint=await computeMailDraftHash(thread.id);
 let sendLock;
 try{sendLock=await acquireMailSendLock({threadId:thread.id,fingerprint,userId:user.id});}
 catch(e){redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent(e instanceof Error?e.message:"Email send is already in progress")}`);}
 let gmailMessageId:string;
 try{gmailMessageId=await gmailSendAdvanced(thread.mailAccountId,{to:meta.to,cc:meta.cc,bcc:meta.bcc,subject:thread.subject||"(no subject)",text,inReplyToGmailId:sourceMessageId,threadId:meta.mode==="REPLY"||meta.mode==="REPLY_ALL"?gmailThreadId:undefined,attachments});}
 catch(e){await markMailSendFailure({threadId:thread.id,attemptId:sendLock.attemptId,error:e,accountId:thread.mailAccountId,userId:user.id});redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=DRAFTS&thread=${threadId}&toast_error=${encodeURIComponent(e instanceof Error?e.message:"Gmail send failed")}`);}
 await markMailSendSuccess({threadId:thread.id,attemptId:sendLock.attemptId,gmailMessageId});
 if(thread.aiLevel!=="AUTO")await markMailApprovalSent(thread.id,user.id);
 await prisma.mailThread.update({where:{id:thread.id},data:{snippet:text.slice(0,500),aiDraft:null,lastMessageAt:new Date(),requiresAttention:false,toEmails:meta.to}});
 await deleteMailComposeMeta(thread.id);
 await audit({userId:user.id,action:"EMAIL_PROFESSIONAL_SEND_GMAIL",resourceType:"MailThread",resourceId:thread.id,after:{mailbox:thread.account.email,mode:meta.mode,to:meta.to,cc:meta.cc,bccCount:meta.bcc.length,attachments:files.map(f=>f.id),gmailMessageId,gmailThreadId:gmailThreadId??null,aiLevel:thread.aiLevel,approvalRequired:thread.aiLevel!=="AUTO",sendAttemptId:sendLock.attemptId}});
 revalidatePath("/app/mail");revalidatePath("/app/mail/approvals");revalidatePath("/app/mail/security");redirect(`/app/mail?mailbox=${thread.mailAccountId}&folder=SENT&thread=${thread.id}&toast=${encodeURIComponent("Professional email sent")}`);
}