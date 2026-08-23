import "server-only";
import { prisma } from "@/lib/prisma";

const PREFIX="mail.intelligence.";
export type MailCategory="SALES"|"TRAVEL"|"VISA"|"PAYMENT"|"REFUND"|"DOCUMENT"|"LEGAL"|"COMPLAINT"|"SUPPORT"|"SPAM"|"GENERAL";
export type MailIntelligencePriority="LOW"|"MEDIUM"|"HIGH"|"URGENT";
export type MailDepartment="TRAVEL"|"FINANCE"|"DOCUMENTS"|"LEGAL"|"CUSTOMER_SERVICE"|"ADMINISTRATION";
export type MailEscalation="NONE"|"WATCH"|"HIGH"|"CRITICAL";
export type MailIntelligenceRecord={threadId:string;category:MailCategory;priority:MailIntelligencePriority;department:MailDepartment;needsReply:boolean;escalation:MailEscalation;reason:string[];classifiedAt:string;source:"RULES"|"AI_ENRICHED"};
function key(id:string){return `${PREFIX}${id}`;}
function has(text:string,terms:string[]){return terms.some(t=>text.includes(t));}

export function classifyMailText(input:{threadId:string;subject?:string|null;snippet?:string|null;fromEmail?:string|null;ownEmail:string;hasDraft?:boolean;requiresAttention?:boolean}):MailIntelligenceRecord{
 const text=`${input.subject??""} ${input.snippet??""}`.toLowerCase();
 const sender=(input.fromEmail??"").toLowerCase();
 const incoming=!input.hasDraft&&!sender.includes(input.ownEmail.toLowerCase());
 let category:MailCategory="GENERAL",department:MailDepartment="CUSTOMER_SERVICE",priority:MailIntelligencePriority="MEDIUM",escalation:MailEscalation="NONE";const reason:string[]=[];
 if(has(text,["unsubscribe","newsletter","promotion","marketing email"])||has(sender,["no-reply","noreply","newsletter"])){category="SPAM";priority="LOW";reason.push("Automated/newsletter pattern detected");}
 else if(has(text,["refund","remboursement","reembolso","chargeback","money back"])){category="REFUND";department="FINANCE";priority="HIGH";escalation="HIGH";reason.push("Refund or chargeback language detected");}
 else if(has(text,["lawyer","attorney","legal","lawsuit","avocat","tribunal","mise en demeure","demanda legal"])){category="LEGAL";department="LEGAL";priority="URGENT";escalation="CRITICAL";reason.push("Legal/dispute language detected");}
 else if(has(text,["complaint","complain","plainte","queja","angry","furious","unacceptable","scam","fraud"])){category="COMPLAINT";department="CUSTOMER_SERVICE";priority="HIGH";escalation="HIGH";reason.push("Complaint/escalation language detected");}
 else if(has(text,["visa","consulat","consular","embassy","ambassade","immigration","evisa"])){category="VISA";department="DOCUMENTS";priority="HIGH";reason.push("Visa/consular topic detected");}
 else if(has(text,["flight","vol ","airline","ticket","billet","pnr","booking","reservation","airport","aéroport","aeropuerto","vuelo"])){category="TRAVEL";department="TRAVEL";priority="HIGH";reason.push("Flight/travel topic detected");}
 else if(has(text,["payment","paid","invoice","facture","factura","receipt","reçu","recibo","zelle","paypal","stripe","bank transfer","virement"])){category="PAYMENT";department="FINANCE";priority="HIGH";reason.push("Payment/invoice topic detected");}
 else if(has(text,["passport","passeport","pasaporte","document","attachment","attached","pièce jointe","adjunto","certificate","certificat"])){category="DOCUMENT";department="DOCUMENTS";priority="MEDIUM";reason.push("Document/attachment topic detected");}
 else if(has(text,["price","quote","quotation","how much","cost","tarif","precio","cotización","interested","service"])){category="SALES";department="CUSTOMER_SERVICE";priority="MEDIUM";reason.push("Sales/quote intent detected");}
 else if(has(text,["help","support","problem","issue","cannot","can't","unable","aide","ayuda","problema"])){category="SUPPORT";department="CUSTOMER_SERVICE";priority="MEDIUM";reason.push("Support request language detected");}
 else reason.push("No specialized category rule matched");
 if(has(text,["today","tonight","tomorrow","urgent","urgente","immediately","immediatement","asap","24 hours","24h"])&&category!=="SPAM"){priority="URGENT";if(escalation==="NONE")escalation="WATCH";reason.push("Time-sensitive language detected");}
 if(input.requiresAttention&&priority!=="URGENT"){priority="HIGH";if(escalation==="NONE")escalation="WATCH";reason.push("Thread is already marked for attention");}
 const needsReply=incoming&&category!=="SPAM";
 if(needsReply)reason.push("Latest local thread appears inbound and requires a response workflow");
 return{threadId:input.threadId,category,priority,department,needsReply,escalation,reason:[...new Set(reason)].slice(0,6),classifiedAt:new Date().toISOString(),source:"RULES"};
}
export async function getMailIntelligence(threadId:string):Promise<MailIntelligenceRecord|null>{const row=await prisma.appSetting.findUnique({where:{key:key(threadId)},select:{value:true}});if(!row)return null;try{return JSON.parse(row.value) as MailIntelligenceRecord}catch{return null}}
export async function getMailIntelligenceMap(threadIds:string[]){if(!threadIds.length)return new Map<string,MailIntelligenceRecord>();const rows=await prisma.appSetting.findMany({where:{key:{in:threadIds.map(key)}},select:{key:true,value:true}});const out=new Map<string,MailIntelligenceRecord>();for(const r of rows)try{const v=JSON.parse(r.value) as MailIntelligenceRecord;if(v?.threadId)out.set(v.threadId,v)}catch{}return out;}
export async function saveMailIntelligence(v:MailIntelligenceRecord){await prisma.appSetting.upsert({where:{key:key(v.threadId)},update:{value:JSON.stringify(v)},create:{key:key(v.threadId),value:JSON.stringify(v)}});return v;}
export async function classifyStoredThread(threadId:string){const t=await prisma.mailThread.findUnique({where:{id:threadId},include:{account:{select:{email:true}}}});if(!t)return null;const v=classifyMailText({threadId:t.id,subject:t.subject,snippet:t.aiDraft??t.snippet,fromEmail:t.fromEmail,ownEmail:t.account.email,hasDraft:Boolean(t.aiDraft),requiresAttention:t.requiresAttention});await saveMailIntelligence(v);return v;}
export async function refreshMailboxIntelligence(accountId:string,limit=150){const threads=await prisma.mailThread.findMany({where:{mailAccountId:accountId},orderBy:{updatedAt:"desc"},take:Math.max(1,Math.min(limit,300)),include:{account:{select:{email:true}}}});for(const t of threads){const v=classifyMailText({threadId:t.id,subject:t.subject,snippet:t.aiDraft??t.snippet,fromEmail:t.fromEmail,ownEmail:t.account.email,hasDraft:Boolean(t.aiDraft),requiresAttention:t.requiresAttention});await saveMailIntelligence(v);}return threads.length;}
