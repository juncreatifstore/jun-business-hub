import "server-only";
import { prisma } from "@/lib/prisma";
import { can, type CurrentUser } from "@/lib/auth";
import { getMailConversation } from "@/lib/mail-thread-reader";
import { getMailCaseContext } from "@/lib/mail-case-context";

export type MailAIFactBundle = {
  threadId: string;
  mailbox: string;
  clientId: string | null;
  caseId: string | null;
  recipient: string | null;
  subject: string;
  conversationText: string;
  verifiedFacts: string[];
  warnings: string[];
  contextSummary: string;
};

function emailFrom(value: string | null, own: string) {
  const matches=(value??"").match(/[\w.+-]+@[\w.-]+\.\w+/g)??[];
  return matches.find(e=>e.toLowerCase()!==own.toLowerCase())??matches[0]??null;
}
function money(v: unknown){return Number(v??0).toFixed(2);}

export async function buildMailAIContext(user:CurrentUser,threadId:string):Promise<MailAIFactBundle>{
  const thread=await prisma.mailThread.findUnique({where:{id:threadId},include:{account:true,client:true}});
  if(!thread)throw new Error("Mail thread not found");
  const relation=await getMailCaseContext(threadId);
  const caseId=relation.caseId;
  const recipient=emailFrom(thread.fromEmail,thread.account.email);
  const conversation=thread.gmailThreadId?await getMailConversation(thread.mailAccountId,thread.gmailThreadId).catch(()=>[]):[];
  const conversationText=conversation.length
    ? conversation.slice(-12).map((m,i)=>`MESSAGE ${i+1}\nFrom: ${m.from}\nTo: ${m.to.join(", ")}\nDate: ${m.date.toISOString()}\nSubject: ${m.subject}\nBody:\n${(m.body||m.snippet).slice(0,7000)}`).join("\n\n---\n\n").slice(0,45000)
    : `Latest local preview only (full Gmail thread unavailable):\n${thread.snippet??""}`;

  const verifiedFacts:string[]=[];
  const warnings:string[]=[];

  if(thread.client&&can(user,"CLIENT_READ")){
    verifiedFacts.push(`CLIENT: ${thread.client.firstName} ${thread.client.lastName} | ID ${thread.client.internalId} | status ${thread.client.status} | email ${thread.client.email??"not recorded"} | country ${thread.client.country??"not recorded"}`);
  }else if(!thread.clientId){warnings.push("No client is linked to this email.");}

  let linkedCase:null|{id:string;caseNumber:string;title:string;status:string;priority:string;dueDate:Date|null;owner:{firstName:string;lastName:string}|null}=null;
  if(caseId&&can(user,"CASE_READ")){
    linkedCase=await prisma.case.findUnique({where:{id:caseId},select:{id:true,caseNumber:true,title:true,status:true,priority:true,dueDate:true,owner:{select:{firstName:true,lastName:true}}}});
    if(linkedCase)verifiedFacts.push(`CASE: ${linkedCase.caseNumber} | ${linkedCase.title} | status ${linkedCase.status} | priority ${linkedCase.priority} | due ${linkedCase.dueDate?.toISOString().slice(0,10)??"none"} | owner ${linkedCase.owner?`${linkedCase.owner.firstName} ${linkedCase.owner.lastName}`:"unassigned"}`);
  }else if(!caseId){warnings.push("No Case is linked to this email.");}

  const clientId=thread.clientId??null;
  if(clientId&&can(user,"TASK_READ")){
    const tasks=await prisma.task.findMany({where:{clientId,...(caseId?{caseId}:{})},orderBy:{updatedAt:"desc"},take:12,select:{title:true,status:true,priority:true,dueDate:true}});
    verifiedFacts.push(`TASKS (${tasks.length} recent): ${tasks.length?tasks.map(t=>`${t.title} [${t.status}/${t.priority}${t.dueDate?` due ${t.dueDate.toISOString().slice(0,10)}`:""}]`).join("; "):"none"}`);
  }

  if(clientId&&can(user,"DOCUMENT_READ")){
    const docs=await prisma.document.findMany({where:{clientId,...(caseId?{caseId}:{})},orderBy:{updatedAt:"desc"},take:12,select:{documentId:true,title:true,type:true,status:true,finalizedAt:true}});
    verifiedFacts.push(`DOCUMENTS (${docs.length} recent): ${docs.length?docs.map(d=>`${d.documentId} ${d.title} [${d.type}/${d.status}${d.finalizedAt?` finalized ${d.finalizedAt.toISOString().slice(0,10)}`:""}]`).join("; "):"none"}`);
  }

  if(clientId&&can(user,"FILE_READ")){
    const files=await prisma.file.findMany({where:{clientId,...(caseId?{caseId}:{}) ,archivedAt:null,isVault:false},orderBy:{createdAt:"desc"},take:12,select:{name:true,category:true,createdAt:true}});
    verifiedFacts.push(`FILES (${files.length} recent, non-vault): ${files.length?files.map(f=>`${f.name} [${f.category}, ${f.createdAt.toISOString().slice(0,10)}]`).join("; "):"none"}`);
  }

  if(clientId&&can(user,"PAYMENT_READ")){
    const payments=await prisma.payment.findMany({where:{clientId,...(caseId?{caseId}:{})},orderBy:{createdAt:"desc"},take:20,select:{reference:true,amount:true,currency:true,status:true,paidAt:true,createdAt:true}});
    verifiedFacts.push(`PAYMENTS (${payments.length}): ${payments.length?payments.map(p=>`${p.reference} ${p.currency} ${money(p.amount)} [${p.status}] ${p.paidAt?`paid ${p.paidAt.toISOString().slice(0,10)}`:`created ${p.createdAt.toISOString().slice(0,10)}`}`).join("; "):"none recorded"}`);
  }else if(clientId){warnings.push("Payment details are not available to this user; do not make payment-status claims.");}

  if(clientId&&can(user,"REFUND_READ")){
    const refunds=await prisma.refund.findMany({where:{clientId,...(caseId?{caseId}:{})},orderBy:{createdAt:"desc"},take:20,include:{installments:{orderBy:{number:"asc"}}}});
    verifiedFacts.push(`REFUNDS (${refunds.length}): ${refunds.length?refunds.map(r=>{const paid=r.installments.filter(i=>i.status==="PAID").reduce((s,i)=>s+Number(i.amount),0);const remaining=Math.max(0,Number(r.amount)-paid);return `${r.refundNumber} ${r.currency} ${money(r.amount)} [${r.status}] paid ${paid.toFixed(2)} remaining ${remaining.toFixed(2)}`;}).join("; "):"none recorded"}`);
  }else if(clientId){warnings.push("Refund details are not available to this user; do not make refund-status claims.");}

  const contextSummary=[
    `MAILBOX: ${thread.account.displayName||thread.account.email} <${thread.account.email}>`,
    `SUBJECT: ${thread.subject??"(no subject)"}`,
    `RECIPIENT FOR REPLY: ${recipient??"unknown"}`,
    "\nVERIFIED FACTS FROM JUN (these may be stated as facts):",
    verifiedFacts.length?verifiedFacts.map(x=>`- ${x}`).join("\n"):"- No linked verified business facts available.",
    "\nWARNINGS / MISSING CONTEXT:",
    warnings.length?warnings.map(x=>`- ${x}`).join("\n"):"- none",
    "\nEMAIL CONTENT (claims in emails are NOT verified business facts unless corroborated above):",
    conversationText,
  ].join("\n");

  return{threadId,mailbox:thread.account.email,clientId,caseId,recipient,subject:thread.subject??"(no subject)",conversationText,verifiedFacts,warnings,contextSummary};
}
