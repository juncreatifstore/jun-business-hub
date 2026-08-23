import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getCaseFinanceOverview } from "@/lib/case-finance-overview";
import { getCaseOperations } from "@/lib/case-operations";
import { listCaseCommunications } from "@/lib/case-communications";
import { addCaseNote } from "@/services/cases";
import { addCaseCommunication, deleteCaseCommunication } from "@/services/case-communications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { MessageSquareText, NotebookPen, PhoneCall, History, AlertTriangle } from "lucide-react";

export const dynamic="force-dynamic";

type TimelineItem={id:string;date:Date;kind:string;title:string;description:string;status?:string|null;href?:string|null;amount?:string|null;importance?:string|null};

export default async function CaseHistoryPage({params}:{params:Promise<{id:string}>|{id:string}}){
 const user=await requireUser();if(!can(user,"CASE_READ"))redirect("/app/forbidden");const {id}=await Promise.resolve(params);
 const [c,finance,ops,communications]=await Promise.all([
  prisma.case.findUnique({where:{id},include:{client:true,owner:true,notes:{include:{author:true},orderBy:{createdAt:"desc"}},tasks:{include:{assignee:true},orderBy:{createdAt:"desc"}},documents:{orderBy:{updatedAt:"desc"}},files:{where:{isVault:false,archivedAt:null},orderBy:{createdAt:"desc"}},activities:{include:{user:true},orderBy:{createdAt:"desc"},take:300}}}),
  getCaseFinanceOverview(id),getCaseOperations(id),listCaseCommunications(id)
 ]);if(!c||!finance)notFound();

 const items:TimelineItem[]=[];
 items.push({id:`case-${c.id}`,date:c.createdAt,kind:"CASE",title:`${c.caseNumber} opened`,description:`${c.title} · ${c.type}`,status:c.status,href:`/app/cases/${c.id}/dashboard`});
 for(const n of c.notes)items.push({id:`note-${n.id}`,date:n.createdAt,kind:"NOTE",title:`Internal note · ${n.author.firstName} ${n.author.lastName}`,description:n.body});
 for(const t of c.tasks)items.push({id:`task-${t.id}`,date:t.createdAt,kind:"TASK",title:t.title,description:`${t.assignee?`${t.assignee.firstName} ${t.assignee.lastName}`:"Unassigned"}${t.dueDate?` · due ${t.dueDate.toISOString().slice(0,10)}`:""}`,status:t.status,href:`/app/tasks?focus=${t.id}`});
 for(const m of ops.milestones)items.push({id:`milestone-${m.id}`,date:new Date(m.createdAt),kind:"MILESTONE",title:m.title,description:[m.description,m.blocker?`Blocker: ${m.blocker}`:""].filter(Boolean).join(" · "),status:m.status,href:`/app/cases/${c.id}/operations`});
 for(const d of c.documents)items.push({id:`doc-${d.id}`,date:d.updatedAt,kind:"DOCUMENT",title:d.title,description:`${d.documentId} · ${d.type.replaceAll("_"," ")}`,status:d.status,href:`/app/documents/${d.id}`});
 for(const f of c.files)items.push({id:`file-${f.id}`,date:f.createdAt,kind:"FILE",title:f.name,description:`Drive file · ${f.category.replaceAll("_"," ")}`,href:`/api/files/${f.id}`});
 for(const p of finance.payments)items.push({id:`pay-${p.id}`,date:p.paidAt||p.createdAt,kind:"PAYMENT",title:p.reference,description:`Gross ${formatMoney(p.gross,p.currency)} · fee ${formatMoney(p.fee,p.currency)} · net ${formatMoney(p.net,p.currency)} · applied to case ${formatMoney(p.appliedToCase,p.currency)}`,status:p.status,href:`/app/finance/payments/${p.id}`,amount:formatMoney(p.appliedToCase||p.net,p.currency)});
 for(const r of finance.refunds)items.push({id:`refund-${r.id}`,date:r.createdAt,kind:"REFUND",title:r.refundNumber,description:r.reason,status:r.status,href:`/app/finance/refunds/${r.id}`,amount:`-${formatMoney(r.amountNumber,r.currency)}`});
 for(const row of finance.invoices){const i=row.invoice;items.push({id:`inv-${i.id}`,date:new Date(i.createdAt),kind:"INVOICE",title:i.invoiceNumber,description:i.title||"Case invoice",status:row.state.effectiveStatus,href:`/app/finance/invoices/${i.id}`,amount:formatMoney(i.total,i.currency)});}
 for(const e of finance.expenses)items.push({id:`exp-${e.id}`,date:new Date(e.updatedAt),kind:"EXPENSE",title:e.expenseNumber,description:`${e.vendorName} · ${e.category.replaceAll("_"," ")} · ${e.description}`,status:e.effectiveStatus,href:`/app/finance/expenses/${e.id}`,amount:`-${formatMoney(e.amount,e.currency)}`});
 for(const comm of communications)items.push({id:`comm-${comm.id}`,date:new Date(comm.occurredAt),kind:"COMMUNICATION",title:`${comm.channel} · ${comm.subject}`,description:`${comm.direction}${comm.contact?` · ${comm.contact}`:""}\n${comm.summary}`,importance:comm.importance});
 for(const a of c.activities)items.push({id:`activity-${a.id}`,date:a.createdAt,kind:"ACTIVITY",title:a.message,description:a.user?`${a.user.firstName} ${a.user.lastName}`:"System"});
 items.sort((a,b)=>b.date.getTime()-a.date.getTime());
 const critical=communications.filter(x=>x.importance==="CRITICAL").length;

 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/app/cases/${id}/dashboard`} className="text-sm text-muted2 hover:text-electric">← Case 360</Link><h1 className="mt-2 text-2xl font-semibold">Timeline, Notes & Communications</h1><p className="mt-1 text-sm text-muted2">{c.caseNumber} · {c.title} · {c.client.firstName} {c.client.lastName}</p></div><div className="flex gap-2"><Link href={`/app/cases/${id}/operations`}><Button variant="outline">Operations</Button></Link><Link href={`/app/cases/${id}/documents`}><Button variant="outline">Documents</Button></Link></div></div>

  {critical?<div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><AlertTriangle className="mt-0.5 h-4 w-4"/><div><strong>{critical} critical communication{critical>1?"s":""}</strong> recorded on this Case. Review before closing or changing service status.</div></div>:null}

  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={History} label="Timeline events" value={String(items.length)}/><Metric icon={NotebookPen} label="Internal notes" value={String(c.notes.length)}/><Metric icon={MessageSquareText} label="Communications" value={String(communications.length)}/><Metric icon={PhoneCall} label="Client-facing exchanges" value={String(communications.filter(x=>x.direction!=="INTERNAL").length)}/><Metric icon={AlertTriangle} label="Critical" value={String(critical)}/></div>

  <div className="grid gap-5 xl:grid-cols-2">
   {can(user,"CASE_UPDATE")?<Card><CardHeader><CardTitle>Add internal note</CardTitle></CardHeader><CardContent><form action={addCaseNote.bind(null,id)} className="space-y-3"><Textarea name="body" required maxLength={5000} rows={5} placeholder="Internal observation, decision, follow-up, risk or instruction…"/><Button variant="primary">Add note</Button></form></CardContent></Card>:null}
   {can(user,"CASE_UPDATE")?<Card><CardHeader><CardTitle>Log communication</CardTitle></CardHeader><CardContent><form action={addCaseCommunication.bind(null,id)} className="grid gap-3 sm:grid-cols-2"><Select name="channel" defaultValue="WHATSAPP"><option>EMAIL</option><option>WHATSAPP</option><option>PHONE</option><option>MEETING</option><option>SMS</option><option>OTHER</option></Select><Select name="direction" defaultValue="OUTBOUND"><option value="OUTBOUND">OUTBOUND</option><option value="INBOUND">INBOUND</option><option value="INTERNAL">INTERNAL</option></Select><Select name="importance" defaultValue="NORMAL"><option value="NORMAL">NORMAL</option><option value="IMPORTANT">IMPORTANT</option><option value="CRITICAL">CRITICAL</option></Select><Input name="occurredAt" type="datetime-local"/><Input name="subject" required maxLength={200} placeholder="Subject / purpose" className="sm:col-span-2"/><Input name="contact" maxLength={250} placeholder="Contact: client, agency, airline, consulate…" className="sm:col-span-2"/><Textarea name="summary" required maxLength={5000} rows={4} placeholder="Professional summary of what was discussed, promised, requested or decided…" className="sm:col-span-2"/><Button variant="primary" className="sm:col-span-2">Record communication</Button></form></CardContent></Card>:null}
  </div>

  {communications.length?<Card><CardHeader><div><CardTitle>Communication register</CardTitle><p className="mt-1 text-xs text-muted2">Structured record of client and third-party exchanges related to this Case.</p></div></CardHeader><CardContent className="p-0"><div className="divide-y divide-line">{communications.map(comm=><div key={comm.id} className="grid gap-3 px-5 py-4 md:grid-cols-[145px_110px_minmax(0,1fr)_auto]"><div className="text-xs text-muted2">{formatDateTime(new Date(comm.occurredAt))}</div><div className="space-y-1"><Badge className="border border-line bg-surface text-muted2">{comm.channel}</Badge><div><Badge className={comm.importance==="CRITICAL"?"bg-red-100 text-red-700":comm.importance==="IMPORTANT"?"bg-amber-100 text-amber-800":"bg-surface text-muted2"}>{comm.importance}</Badge></div></div><div><p className="font-medium">{comm.subject}</p><p className="mt-1 text-xs text-muted2">{comm.direction}{comm.contact?` · ${comm.contact}`:""}</p><p className="mt-2 whitespace-pre-wrap text-sm">{comm.summary}</p></div>{can(user,"CASE_UPDATE")?<details className="text-right"><summary className="cursor-pointer text-xs text-red-600">Remove</summary><form action={deleteCaseCommunication.bind(null,id,comm.id)} className="mt-2 w-56 space-y-2"><Input name="reason" required placeholder="Deletion reason"/><Button variant="outline">Confirm removal</Button></form></details>:null}</div>)}</div></CardContent></Card>:null}

  <Card><CardHeader><div><CardTitle>Complete Case timeline</CardTitle><p className="mt-1 text-xs text-muted2">Operations, finance, documents, notes, communications and system activity consolidated chronologically.</p></div></CardHeader><CardContent className="p-0">{items.length?<div className="divide-y divide-line">{items.map(item=><div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[150px_120px_minmax(0,1fr)_auto]"><div className="text-xs text-muted2">{formatDateTime(item.date)}</div><div><Badge className="border border-line bg-surface text-muted2">{item.kind}</Badge></div><div><div className="flex flex-wrap items-center gap-2">{item.href?<Link href={item.href} className="font-medium hover:text-electric">{item.title}</Link>:<span className="font-medium">{item.title}</span>}{item.status?<StatusBadge status={item.status}/>:null}{item.importance&&item.importance!=="NORMAL"?<Badge className={item.importance==="CRITICAL"?"bg-red-100 text-red-700":"bg-amber-100 text-amber-800"}>{item.importance}</Badge>:null}</div><p className="mt-1 whitespace-pre-wrap text-sm text-muted2">{item.description}</p></div><div className="text-right font-medium">{item.amount||""}</div></div>)}</div>:<p className="p-5 text-sm text-muted2">No timeline event yet.</p>}</CardContent></Card>
 </div>;
}

function Metric({icon:Icon,label,value}:{icon:any;label:string;value:string}){return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-electric"/><p className="mt-3 text-xs text-muted2">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>}
