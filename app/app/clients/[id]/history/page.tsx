import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { addClientNote } from "@/services/clients";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

type TimelineItem={id:string;date:Date;kind:string;title:string;description:string;status?:string;href?:string|null;amount?:string|null};

export default async function ClientHistoryPage({params}:{params:Promise<{id:string}>|{id:string}}){
  const user=await requirePermission("CLIENT_READ");
  const {id}=await Promise.resolve(params);
  const [client,finance]=await Promise.all([
    prisma.client.findUnique({where:{id},include:{
      cases:{orderBy:{createdAt:"desc"},select:{id:true,caseNumber:true,title:true,status:true,createdAt:true}},
      documents:{orderBy:{updatedAt:"desc"},select:{id:true,documentId:true,title:true,type:true,status:true,createdAt:true,updatedAt:true}},
      files:{where:{isVault:false,archivedAt:null},orderBy:{createdAt:"desc"},select:{id:true,name:true,category:true,createdAt:true}},
      clientNotes:{orderBy:{createdAt:"desc"},include:{author:{select:{firstName:true,lastName:true}}}},
      activities:{orderBy:{createdAt:"desc"},take:200,include:{user:{select:{firstName:true,lastName:true}}}},
    }}),
    getClientFinanceOverview(id),
  ]);
  if(!client)notFound();

  const items:TimelineItem[]=[];
  for(const c of client.cases)items.push({id:`case-${c.id}`,date:c.createdAt,kind:"SERVICE",title:`${c.caseNumber} · ${c.title}`,description:"Service / case opened",status:c.status,href:`/app/cases/${c.id}`});
  for(const d of client.documents)items.push({id:`doc-${d.id}`,date:d.updatedAt,kind:"DOCUMENT",title:d.title,description:`${d.documentId} · ${d.type.replaceAll("_"," ")}`,status:d.status,href:`/app/documents/${d.id}`});
  for(const f of client.files)items.push({id:`file-${f.id}`,date:f.createdAt,kind:"FILE",title:f.name,description:`Drive file · ${f.category.replaceAll("_"," ")}`,href:`/app/drive?q=${encodeURIComponent(f.name)}`});
  for(const p of finance.payments)items.push({id:`pay-${p.id}`,date:p.paidAt||p.createdAt,kind:"PAYMENT",title:p.reference,description:`Gross ${formatMoney(p.gross,p.currency)} · fees ${formatMoney(p.fee,p.currency)} · net ${formatMoney(p.net,p.currency)}`,status:p.status,href:`/app/finance/payments/${p.id}`,amount:formatMoney(p.net,p.currency)});
  for(const r of finance.refunds)items.push({id:`refund-${r.id}`,date:r.createdAt,kind:"REFUND",title:r.refundNumber,description:r.reason,status:r.status,href:`/app/finance/refunds/${r.id}`,amount:`-${formatMoney(r.amountNumber,r.currency)}`});
  for(const row of finance.invoices){const i=row.invoice;items.push({id:`inv-${i.id}`,date:new Date(i.createdAt),kind:"INVOICE",title:i.invoiceNumber,description:i.title||"Client invoice",status:row.state.effectiveStatus,href:`/app/finance/invoices/${i.id}`,amount:formatMoney(i.total,i.currency)});}
  for(const e of finance.expenses)items.push({id:`exp-${e.id}`,date:new Date(e.updatedAt),kind:"EXPENSE",title:e.expenseNumber,description:`${e.vendorName} · ${e.category.replaceAll("_"," ")} · ${e.description}`,status:e.effectiveStatus,href:`/app/finance/expenses/${e.id}`,amount:`-${formatMoney(e.amount,e.currency)}`});
  for(const n of client.clientNotes)items.push({id:`note-${n.id}`,date:n.createdAt,kind:"NOTE",title:`Team note · ${n.author.firstName} ${n.author.lastName}`,description:n.body});
  items.sort((a,b)=>b.date.getTime()-a.date.getTime());

  const noteAction=addClientNote.bind(null,client.id);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/app/clients/${client.id}/dashboard`} className="text-sm text-muted2 hover:text-electric">← Client 360</Link><h1 className="mt-2 text-2xl font-semibold">{client.firstName} {client.lastName} · Timeline & Notes</h1><p className="registry-id mt-1 text-muted2">{client.internalId} · consolidated client history</p></div><div className="flex flex-wrap gap-2"><Link href={`/app/clients/${client.id}/dashboard`}><Button variant="outline">Client 360</Button></Link><Link href={`/app/clients/${client.id}/statement`}><Button variant="outline">Statement</Button></Link><a href={`/api/clients/${client.id}/statement.pdf`} target="_blank" rel="noreferrer"><Button variant="primary">Statement PDF</Button></a></div></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Timeline events" value={String(items.length)}/><Metric label="Team notes" value={String(client.clientNotes.length)}/><Metric label="Services" value={String(client.cases.length)}/><Metric label="Financial events" value={String(finance.payments.length+finance.invoices.length+finance.expenses.length+finance.refunds.length)}/></div>

    {can(user,"CLIENT_UPDATE")?<Card><CardHeader><CardTitle>Add internal note</CardTitle></CardHeader><CardContent><form action={noteAction} className="flex flex-col gap-3 md:flex-row"><Textarea name="body" placeholder="Add an internal note about this client, service, follow-up or decision…" required maxLength={5000} className="min-h-[90px] flex-1"/><div className="flex items-end"><Button variant="primary">Add note</Button></div></form></CardContent></Card>:null}

    <Card><CardHeader><div><CardTitle>Complete client timeline</CardTitle><p className="mt-1 text-xs text-muted2">Services, finance, documents, Drive files and team notes in one chronological view.</p></div></CardHeader><CardContent className="p-0">{items.length?<div className="divide-y divide-line">{items.map((item)=><div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[150px_110px_minmax(0,1fr)_auto]"><div className="text-xs text-muted2">{formatDateTime(item.date)}</div><div><Badge className="border border-line bg-surface text-muted2">{item.kind}</Badge></div><div><div className="flex flex-wrap items-center gap-2">{item.href?<Link href={item.href} className="font-medium hover:text-electric">{item.title}</Link>:<span className="font-medium">{item.title}</span>}{item.status?<StatusBadge status={item.status}/>:null}</div><p className="mt-1 whitespace-pre-wrap text-sm text-muted2">{item.description}</p></div><div className="text-right font-medium">{item.amount||""}</div></div>)}</div>:<p className="p-5 text-sm text-muted2">No timeline events yet.</p>}</CardContent></Card>
  </div>;
}

function Metric({label,value}:{label:string;value:string}){return <Card><CardContent className="p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></CardContent></Card>}
