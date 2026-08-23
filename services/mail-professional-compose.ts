"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { classifyEmailAILevel } from "@/services/ai";
import { emptyToNull } from "@/lib/validation";
import { parseEmailList, saveMailComposeMeta, type MailComposeMode } from "@/lib/mail-compose-meta";

const MODES:MailComposeMode[]=["NEW","REPLY","REPLY_ALL","FORWARD"];
function bad(message:string,mailbox="ALL"):never{redirect(`/app/mail/compose?mailbox=${encodeURIComponent(mailbox)}&toast_error=${encodeURIComponent(message)}`);}

export async function saveProfessionalMailDraft(formData:FormData){
 const user=await assertPermission("EMAIL_DRAFT");
 const mailAccountId=String(formData.get("mailAccountId")||"").trim();
 const subject=String(formData.get("subject")||"").trim().slice(0,200);
 const body=String(formData.get("body")||"").trim().slice(0,30000);
 const to=parseEmailList(String(formData.get("to")||""));
 const cc=parseEmailList(String(formData.get("cc")||""));
 const bcc=parseEmailList(String(formData.get("bcc")||""));
 const clientId=String(formData.get("clientId")||"").trim();
 const sourceThreadId=String(formData.get("sourceThreadId")||"").trim()||null;
 const sourceGmailMessageId=String(formData.get("sourceGmailMessageId")||"").trim()||null;
 const modeRaw=String(formData.get("mode")||"NEW").toUpperCase() as MailComposeMode;
 const mode=MODES.includes(modeRaw)?modeRaw:"NEW";
 const signatureId=String(formData.get("signatureId")||"").trim()||null;
 const templateId=String(formData.get("templateId")||"").trim()||null;
 const attachmentFileIds=[...new Set(formData.getAll("attachmentFileIds").map(v=>String(v)).filter(Boolean))].slice(0,10);
 if(!mailAccountId)bad("Select a mailbox");if(!to.length)bad("Enter at least one valid recipient",mailAccountId);if(!subject||!body)bad("Subject and message are required",mailAccountId);
 const account=await prisma.mailAccount.findFirst({where:{id:mailAccountId,OR:[{accessTokenEnc:{not:null}},{refreshTokenEnc:{not:null}}]},select:{id:true,email:true}});if(!account)bad("Selected mailbox is not connected",mailAccountId);
 if(attachmentFileIds.length){await assertPermission("FILE_READ");const allowed=await prisma.file.count({where:{id:{in:attachmentFileIds},isVault:false,archivedAt:null}});if(allowed!==attachmentFileIds.length)bad("One or more selected attachments are unavailable",mailAccountId);}
 let source=null as null|{id:string;mailAccountId:string;clientId:string|null;gmailThreadId:string};
 if(sourceThreadId){source=await prisma.mailThread.findFirst({where:{id:sourceThreadId,mailAccountId},select:{id:true,mailAccountId:true,clientId:true,gmailThreadId:true}});if(!source)bad("Source conversation not found in this mailbox",mailAccountId);}
 const aiLevel=await classifyEmailAILevel(subject,body);
 const thread=await prisma.mailThread.create({data:{gmailThreadId:`local-draft-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,mailAccountId,clientId:emptyToNull(clientId)||source?.clientId||null,subject,snippet:body.slice(0,500),fromEmail:account.email,toEmails:to,aiLevel,aiSummary:aiLevel==="BLOCKED"?"Sensitive topic — manual handling required":aiLevel==="AUTO"?"Routine message":"Needs human approval",aiDraft:body,requiresAttention:aiLevel!=="AUTO"}});
 await saveMailComposeMeta({threadId:thread.id,mode,to,cc,bcc,attachmentFileIds,sourceThreadId:source?.id??null,sourceGmailMessageId,signatureId,templateId,updatedAt:new Date().toISOString()});
 await audit({userId:user.id,action:"EMAIL_PROFESSIONAL_DRAFT_CREATE",resourceType:"MailThread",resourceId:thread.id,after:{mailAccountId,mailbox:account.email,mode,toCount:to.length,ccCount:cc.length,bccCount:bcc.length,attachments:attachmentFileIds.length,sourceThreadId:source?.id??null,aiLevel}});
 revalidatePath("/app/mail");redirect(`/app/mail?mailbox=${encodeURIComponent(mailAccountId)}&folder=DRAFTS&thread=${thread.id}&toast=${encodeURIComponent("Professional draft saved")}`);
}
