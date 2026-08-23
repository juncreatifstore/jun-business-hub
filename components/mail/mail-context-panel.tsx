import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getMailCaseContext } from "@/lib/mail-case-context";
import { getMailConversation } from "@/lib/mail-thread-reader";
import { updateMailClientCase, createTaskFromMail, logMailToCaseTimeline, importMailAttachmentToCase } from "@/services/mail-case-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export async function MailContextPanel({threadId}:{threadId:string}){
 const user=await requireUser();
 if(!can(user,"EMAIL_READ"))return null;
 const [thread,context]=await Promise.all([
  prisma.mailThread.findUnique({where:{id:threadId},include:{client:true,account:{select:{email:true,displayName:true}}}}),
  getMailCaseContext(threadId),
 ]);
 if(!thread)return null;
 const [clients,cases,linkedCase,conversation]=await Promise.all([
  prisma.client.findMany({where:{status:{not:"ARCHIVED"}},orderBy:[{lastName:"asc"},{firstName:"asc"}],take:400,select:{id:true,internalId:true,firstName:true,lastName:true,email:true}}),
  prisma.case.findMany({where:{status:{notIn:["COMPLETED","CANCELLED","ARCHIVED"]}},orderBy:{updatedAt:"desc"},take:400,select:{id:true,caseNumber:true,title:true,status:true,priority:true,clientId:true,client:{select:{firstName:true,lastName:true,internalId:true}}}}),
  context.caseId?prisma.case.findUnique({where:{id:context.caseId},select:{id:true,caseNumber:true,title:true,status:true,priority:true,clientId:true}}):Promise.resolve(null),
  !thread.aiDraft?getMailConversation(thread.mailAccountId,thread.gmailThreadId).catch(()=>[]):Promise.resolve([]),
 ]);
 const canTask=can(user,"TASK_CREATE"),canCaseUpdate=can(user,"CASE_UPDATE"),canFileUpload=can(user,"FILE_UPLOAD");
 const linkedClientId=thread.clientId??linkedCase?.clientId??"";
 const eligibleCases=linkedClientId?cases.filter(c=>c.clientId===linkedClientId):cases;
 const defaultTaskTitle=`Follow up: ${thread.subject||"email"}`.slice(0,240);
 const gmailAttachments=conversation.flatMap(m=>m.attachments.filter(a=>a.attachmentId).map(a=>({messageId:m.id,...a})));
 return <Card>
  <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>Client & Case context</CardTitle><div className="flex gap-2">{thread.client?<Link href={`/app/clients/${thread.client.id}/dashboard`}><Button variant="outline" size="sm">Open Client 360</Button></Link>:null}{linkedCase?<Link href={`/app/cases/${linkedCase.id}/dashboard`}><Button variant="outline" size="sm">Open Case 360</Button></Link>:null}</div></div></CardHeader>
  <CardContent className="space-y-5">
   <div className="grid gap-3 md:grid-cols-3">
    <div className="rounded-lg border border-line bg-surface/50 p-3"><p className="text-xs text-muted2">Mailbox</p><p className="mt-1 text-sm font-medium">{thread.account.displayName||thread.account.email}</p></div>
    <div className="rounded-lg border border-line bg-surface/50 p-3"><p className="text-xs text-muted2">Client</p><p className="mt-1 text-sm font-medium">{thread.client?`${thread.client.firstName} ${thread.client.lastName}`:"Not linked"}</p></div>
    <div className="rounded-lg border border-line bg-surface/50 p-3"><p className="text-xs text-muted2">Case</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{linkedCase?`${linkedCase.caseNumber} · ${linkedCase.title}`:"Not linked"}</p>{linkedCase?<Badge>{linkedCase.status.replaceAll("_"," ")}</Badge>:null}</div></div>
   </div>

   <form action={updateMailClientCase.bind(null,thread.id)} className="grid gap-3 rounded-xl border border-line p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
    <Field label="Link client"><Select name="clientId" defaultValue={linkedClientId}><option value="">— No client —</option>{clients.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.internalId}{c.email?` · ${c.email}`:""}</option>)}</Select></Field>
    <Field label="Link Case"><Select name="caseId" defaultValue={linkedCase?.id||""}><option value="">— No Case —</option>{eligibleCases.map(c=><option key={c.id} value={c.id}>{c.caseNumber} · {c.title} · {c.client.firstName} {c.client.lastName}</option>)}</Select></Field>
    <Button variant="secondary">Save context</Button>
   </form>

   {canTask?<form action={createTaskFromMail.bind(null,thread.id)} className="rounded-xl border border-line p-4"><p className="mb-3 text-sm font-semibold">Create task from this email</p><div className="grid gap-3 md:grid-cols-[1fr_150px_190px_auto] md:items-end"><Field label="Task title"><Input name="title" defaultValue={defaultTaskTitle} maxLength={240}/></Field><Field label="Priority"><Select name="priority" defaultValue={linkedCase?.priority||"MEDIUM"}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></Select></Field><Field label="Due date"><Input name="dueDate" type="date"/></Field><Button variant="primary">Create task</Button></div><p className="mt-2 text-xs text-muted2">If a Case is linked, the task is attached to that Case and assigned to its owner.</p></form>:null}

   {linkedCase&&canCaseUpdate?<form action={logMailToCaseTimeline.bind(null,thread.id)} className="rounded-xl border border-line p-4"><p className="mb-3 text-sm font-semibold">Add email to Case Timeline</p><div className="grid gap-3 md:grid-cols-[180px_1fr_auto] md:items-end"><Field label="Importance"><Select name="importance" defaultValue="NORMAL"><option>NORMAL</option><option>IMPORTANT</option><option>CRITICAL</option></Select></Field><Field label="Timeline summary"><Textarea name="summary" rows={2} defaultValue={thread.aiSummary||thread.snippet||""}/></Field><Button variant="secondary">Log to Timeline</Button></div></form>:null}

   {linkedCase&&canFileUpload&&gmailAttachments.length?<div className="rounded-xl border border-line p-4"><div className="mb-3"><p className="text-sm font-semibold">Gmail attachments</p><p className="mt-1 text-xs text-muted2">Save selected incoming attachments directly to JUN Drive and the linked Case.</p></div><div className="grid gap-2 md:grid-cols-2">{gmailAttachments.map((a,i)=><div key={`${a.messageId}-${a.attachmentId}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface/40 p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{a.filename}</p><p className="text-xs text-muted2">{a.mimeType} · {a.size?`${Math.ceil(a.size/1024)} KB`:"size unknown"}</p></div><form action={importMailAttachmentToCase.bind(null,thread.id)}><input type="hidden" name="messageId" value={a.messageId}/><input type="hidden" name="attachmentId" value={a.attachmentId||""}/><Button size="sm" variant="outline">Save to Case Drive</Button></form></div>)}</div></div>:null}
  </CardContent>
 </Card>;
}
