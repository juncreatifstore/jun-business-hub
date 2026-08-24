import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchMailThreads } from "@/lib/mail-analytics";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Field,Input,Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const dynamic="force-dynamic";
const CATEGORIES=["SALES","TRAVEL","VISA","PAYMENT","REFUND","DOCUMENT","LEGAL","COMPLAINT","SUPPORT","SPAM","GENERAL"];
const PRIORITIES=["LOW","MEDIUM","HIGH","URGENT"];
const DEPARTMENTS=["TRAVEL","FINANCE","DOCUMENTS","LEGAL","CUSTOMER_SERVICE","ADMINISTRATION"];
const STATUSES=["OPEN","WAITING_CLIENT","WAITING_INTERNAL","RESOLVED"];
export default async function MailSearchPage({searchParams}:{searchParams:Record<string,string|undefined>}){
 const user=await requireUser();if(!can(user,"EMAIL_READ"))redirect("/app/forbidden");
 const [accounts,owners]=await Promise.all([
  prisma.mailAccount.findMany({orderBy:{createdAt:"asc"},select:{id:true,email:true,displayName:true}}),
  prisma.user.findMany({where:{status:"ACTIVE",role:{not:"CLIENT"}},orderBy:[{firstName:"asc"},{lastName:"asc"}],select:{id:true,firstName:true,lastName:true}}),
 ]);
 const results=await searchMailThreads({q:searchParams.q,mailboxId:searchParams.mailbox||undefined,category:searchParams.category as never,priority:searchParams.priority as never,department:searchParams.department as never,ownerId:searchParams.owner||undefined,workflowStatus:searchParams.status||undefined,from:searchParams.from||undefined,to:searchParams.to||undefined,days:Number(searchParams.days)||90});
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Advanced Mail Search</h1><p className="mt-1 text-sm text-muted2">Search persisted JUN mail metadata, client context, Intelligence, owner and SLA.</p></div><div className="flex gap-2"><Link href="/app/mail/analytics"><Button variant="secondary">Analytics</Button></Link><Link href="/app/mail"><Button variant="outline">Back to Mail</Button></Link></div></div>
  <Card><CardHeader><CardTitle>Filters</CardTitle></CardHeader><CardContent><form className="grid gap-3 md:grid-cols-4">
   <Field label="Search"><Input name="q" defaultValue={searchParams.q} placeholder="Subject, sender, snippet, client…"/></Field>
   <Field label="From"><Input name="from" defaultValue={searchParams.from} placeholder="sender@example.com"/></Field>
   <Field label="To (exact address)"><Input name="to" defaultValue={searchParams.to} placeholder="recipient@example.com"/></Field>
   <Field label="Period"><Select name="days" defaultValue={searchParams.days||"90"}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option><option value="3650">All available history</option></Select></Field>
   <Field label="Mailbox"><Select name="mailbox" defaultValue={searchParams.mailbox||""}><option value="">All mailboxes</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.displayName||a.email} · {a.email}</option>)}</Select></Field>
   <Field label="Category"><Select name="category" defaultValue={searchParams.category||""}><option value="">All categories</option>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</Select></Field>
   <Field label="Priority"><Select name="priority" defaultValue={searchParams.priority||""}><option value="">All priorities</option>{PRIORITIES.map(x=><option key={x}>{x}</option>)}</Select></Field>
   <Field label="Department"><Select name="department" defaultValue={searchParams.department||""}><option value="">All departments</option>{DEPARTMENTS.map(x=><option key={x}>{x}</option>)}</Select></Field>
   <Field label="Owner"><Select name="owner" defaultValue={searchParams.owner||""}><option value="">All owners</option>{owners.map(o=><option key={o.id} value={o.id}>{o.firstName} {o.lastName}</option>)}</Select></Field>
   <Field label="Workflow"><Select name="status" defaultValue={searchParams.status||""}><option value="">All statuses</option>{STATUSES.map(x=><option key={x}>{x.replaceAll("_"," ")}</option>)}</Select></Field>
   <div className="flex items-end gap-2 md:col-span-2"><Button variant="primary">Search</Button><Link href="/app/mail/search"><Button type="button" variant="ghost">Clear</Button></Link></div>
  </form></CardContent></Card>
  <div className="text-sm text-muted2">{results.length} result(s). Full Gmail body search is not indexed locally yet.</div>
  <div className="space-y-3">{results.map(r=><Card key={r.thread.id}><CardContent className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2">{r.intelligence?<><Badge>{r.intelligence.category}</Badge><Badge>{r.intelligence.priority}</Badge></>:null}<Badge>{r.state.workflowStatus.replaceAll("_"," ")}</Badge>{r.sla?<Badge>{r.sla.status}</Badge>:null}</div><Link href={`/app/mail?mailbox=${encodeURIComponent(r.thread.mailAccountId)}&thread=${r.thread.id}`} className="mt-2 block font-semibold hover:underline">{r.thread.subject||"(no subject)"}</Link><p className="mt-1 text-sm text-muted2">From: {r.thread.fromEmail||"—"} · To: {r.thread.toEmails.join(", ")||"—"}</p><p className="mt-1 line-clamp-2 text-sm">{r.thread.snippet||r.thread.aiDraft||"—"}</p><p className="mt-2 text-xs text-muted2">Mailbox: {r.thread.account.displayName||r.thread.account.email}{r.thread.client?` · Client: ${r.thread.client.firstName} ${r.thread.client.lastName} (${r.thread.client.internalId})`:""}{r.ownerName?` · Owner: ${r.ownerName}`:" · Unassigned"}{r.intelligence?` · Department: ${r.intelligence.department}`:""}</p></div><span className="text-xs text-muted2">{formatDateTime(r.thread.lastMessageAt??r.thread.updatedAt)}</span></div></CardContent></Card>)}{!results.length?<Card><CardContent className="p-6 text-sm text-muted2">No messages match the selected filters.</CardContent></Card>:null}</div>
 </div>;
}
