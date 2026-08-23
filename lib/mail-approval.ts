import "server-only";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { getMailComposeMeta } from "@/lib/mail-compose-meta";

const PREFIX="mail.approval.";
export type MailApprovalStatus="DRAFT"|"PENDING"|"APPROVED"|"REJECTED"|"SENT";
export type MailApprovalRecord={threadId:string;status:MailApprovalStatus;submittedAt?:string;submittedById?:string;approvedAt?:string;approvedById?:string;rejectedAt?:string;rejectedById?:string;decisionNote?:string;draftHash?:string;sentAt?:string;sentById?:string};
function key(threadId:string){return `${PREFIX}${threadId}`;}

export async function computeMailDraftHash(threadId:string){
 const [thread,meta]=await Promise.all([prisma.mailThread.findUnique({where:{id:threadId},select:{subject:true,aiDraft:true,mailAccountId:true,toEmails:true,clientId:true}}),getMailComposeMeta(threadId)]);
 if(!thread||!thread.aiDraft)throw new Error("Draft not found");
 return sha256(JSON.stringify({subject:thread.subject??"",body:thread.aiDraft,mailAccountId:thread.mailAccountId,to:meta?.to??thread.toEmails,cc:meta?.cc??[],bcc:meta?.bcc??[],attachments:[...(meta?.attachmentFileIds??[])].sort(),mode:meta?.mode??"NEW",sourceThreadId:meta?.sourceThreadId??null,clientId:thread.clientId??null}));
}
export async function getMailApproval(threadId:string):Promise<MailApprovalRecord|null>{const row=await prisma.appSetting.findUnique({where:{key:key(threadId)},select:{value:true}});if(!row)return null;try{return JSON.parse(row.value) as MailApprovalRecord}catch{return null}}
export async function saveMailApproval(v:MailApprovalRecord){await prisma.appSetting.upsert({where:{key:key(v.threadId)},update:{value:JSON.stringify(v)},create:{key:key(v.threadId),value:JSON.stringify(v)}});return v;}
export async function approvalIsCurrent(threadId:string){const approval=await getMailApproval(threadId);if(!approval||approval.status!=="APPROVED"||!approval.draftHash)return false;return approval.draftHash===await computeMailDraftHash(threadId);}
export async function markMailApprovalSent(threadId:string,userId:string){const current=await getMailApproval(threadId);if(!current)return;await saveMailApproval({...current,status:"SENT",sentAt:new Date().toISOString(),sentById:userId});}
