import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getClientServiceSummaries } from "@/lib/client-service-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, FileText, FolderKanban, ListChecks, ReceiptText, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CaseDashboardPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const user = await requireUser();
  if (!can(user, "CASE_READ")) redirect("/app/forbidden");
  const { id } = await Promise.resolve(params);

  const c = await prisma.case.findUnique({
    where: { id },
    include: {
      client: true,
      owner: true,
      tasks: { include: { assignee: true }, orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" }, take: 6 },
      files: { orderBy: { createdAt: "desc" }, take: 6 },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 8 },
      _count: { select: { documents: true, files: true, payments: true, refunds: true, notes: true } },
    },
  });
  if (!c) notFound();

  const service = (await getClientServiceSummaries(c.clientId)).find((s) => s.caseId === c.id) ?? null;
  const openTasks = c.tasks.filter((t) => !["DONE", "CANCELLED"].includes(t.status));
  const completedTasks = c.tasks.filter((t) => t.status === "DONE").length;
  const progress = c.tasks.length ? Math.round((completedTasks / c.tasks.length) * 100) : 0;
  const overdue = Boolean(c.dueDate && c.dueDate.getTime() < Date.now() && !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(c.status));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/app/cases" className="text-sm text-muted2 hover:text-electric">← Cases</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{c.title}</h1><StatusBadge status={c.status}/><StatusBadge status={c.priority}/></div>
        <p className="mt-1 registry-id text-sm text-muted2">{c.caseNumber} · {c.type}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/app/clients/${c.clientId}/dashboard`}><Button variant="outline">Client 360</Button></Link>
        <Link href={`/app/cases/${c.id}`}><Button variant="outline">Full record</Button></Link>
        {can(user,"CASE_UPDATE")?<Link href={`/app/cases/${c.id}/edit`}><Button variant="primary">Edit case</Button></Link>:null}
      </div>
    </div>

    {overdue?<div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>Case overdue.</strong> Due date was {formatDate(c.dueDate)} and the case is still {c.status.replaceAll("_"," ").toLowerCase()}.</div></div>:null}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={FolderKanban} label="Status" value={c.status.replaceAll("_"," ")} sub={c.owner?`${c.owner.firstName} ${c.owner.lastName}`:"Unassigned"}/>
      <Metric icon={ListChecks} label="Open tasks" value={String(openTasks.length)} sub={`${progress}% task completion`}/>
      <Metric icon={FileText} label="Documents" value={String(c._count.documents)} sub={`${c._count.files} Drive file(s)`}/>
      <Metric icon={WalletCards} label="Payments" value={String(c._count.payments)} sub={`${c._count.refunds} refund(s)`}/>
      <Metric icon={ReceiptText} label="Invoices" value={String(service?.invoiceCount ?? 0)} sub={`${service?.expenseCount ?? 0} expense(s)`}/>
      <Metric icon={CheckCircle2} label="Due date" value={formatDate(c.dueDate)} sub={`Created ${formatDate(c.createdAt)}`}/>
    </div>

    {service?.currencies.length?<Card><CardHeader><CardTitle>Case financial position</CardTitle></CardHeader><CardContent className="space-y-4">{service.currencies.map((f)=><div key={f.currency} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <Money label="Billed" value={f.billed} currency={f.currency}/><Money label="Invoice paid" value={f.invoicePaid} currency={f.currency}/><Money label="Net received" value={f.netReceived} currency={f.currency}/><Money label="Transfer fees" value={-f.transferFees} currency={f.currency}/><Money label="Actual cost" value={-f.actualCost} currency={f.currency}/><Money label="Committed cost" value={-f.committedCost} currency={f.currency}/><Money label="Profit / loss" value={f.profit} currency={f.currency}/><div><p className="text-xs uppercase tracking-wide text-muted2">Margin</p><p className={`mt-1 font-semibold ${f.marginPercent!=null&&f.marginPercent<0?"text-red-600":""}`}>{f.marginPercent==null?"—":`${f.marginPercent.toFixed(2)}%`}</p></div>
    </div>)}</CardContent></Card>:null}

    <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Operations</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Client"><Link href={`/app/clients/${c.clientId}/dashboard`} className="text-electric hover:underline">{c.client.firstName} {c.client.lastName}</Link></Info>
          <Info label="Responsible owner">{c.owner?`${c.owner.firstName} ${c.owner.lastName}`:"Unassigned"}</Info>
          <Info label="Priority"><StatusBadge status={c.priority}/></Info>
          <Info label="Due date">{formatDate(c.dueDate)}</Info>
          <Info label="Task progress">{completedTasks}/{c.tasks.length} completed ({progress}%)</Info>
          <Info label="Type">{c.type}</Info>
          {c.description?<div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-muted2">Description</p><p className="mt-1 whitespace-pre-wrap text-sm">{c.description}</p></div>:null}
        </CardContent></Card>

        <Card><CardHeader><div><CardTitle>Open tasks</CardTitle><p className="mt-1 text-xs text-muted2">Immediate work still required on this case.</p></div></CardHeader><CardContent className="p-0">{openTasks.length?<ul className="divide-y divide-line">{openTasks.slice(0,8).map((t)=><li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{t.title}</p><p className="text-xs text-muted2">{t.assignee?`${t.assignee.firstName} ${t.assignee.lastName}`:"Unassigned"} · due {formatDate(t.dueDate)}</p></div><StatusBadge status={t.status}/></li>)}</ul>:<p className="p-5 text-sm text-muted2">No open task.</p>}</CardContent></Card>

        <Card><CardHeader><div><CardTitle>Recent documents & files</CardTitle><p className="mt-1 text-xs text-muted2">Latest case records.</p></div></CardHeader><CardContent className="space-y-2">{c.documents.length===0&&c.files.length===0?<p className="text-sm text-muted2">No documents or files yet.</p>:<>{c.documents.map((d)=><Link key={d.id} href={`/app/documents/${d.id}`} className="flex items-center justify-between rounded-lg border border-line p-3 hover:bg-surface"><div><p className="text-sm font-medium">{d.title}</p><p className="registry-id text-xs text-muted2">{d.documentId}</p></div><StatusBadge status={d.status}/></Link>)}{c.files.map((f)=><a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-line p-3 hover:bg-surface"><div><p className="text-sm font-medium">{f.name}</p><p className="text-xs text-muted2">{f.category.replaceAll("_"," ")} · {formatDate(f.createdAt)}</p></div><span className="text-xs text-electric">Open</span></a>)}</>}</CardContent></Card>
      </div>

      <div className="space-y-5">
        <Card><CardHeader><CardTitle>Quick actions</CardTitle></CardHeader><CardContent className="grid gap-2">
          {can(user,"TASK_CREATE")?<Link href={`/app/tasks/new?caseId=${c.id}&clientId=${c.clientId}`}><Button variant="outline" className="w-full justify-start">Create task</Button></Link>:null}
          {can(user,"DOCUMENT_CREATE")?<Link href={`/app/documents/new?caseId=${c.id}&clientId=${c.clientId}`}><Button variant="outline" className="w-full justify-start">Create document</Button></Link>:null}
          {can(user,"PAYMENT_CREATE")?<Link href={`/app/finance/payments/new?caseId=${c.id}&clientId=${c.clientId}`}><Button variant="outline" className="w-full justify-start">Record payment</Button></Link>:null}
          <Link href={`/app/finance/invoices/new?caseId=${c.id}&clientId=${c.clientId}`}><Button variant="outline" className="w-full justify-start">Create invoice</Button></Link>
          <Link href={`/app/finance/expenses/new?caseId=${c.id}&clientId=${c.clientId}`}><Button variant="outline" className="w-full justify-start">Record expense</Button></Link>
          <Link href={`/app/clients/${c.clientId}/profitability`}><Button variant="outline" className="w-full justify-start">Client profitability</Button></Link>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="p-0">{c.activities.length?<ul className="divide-y divide-line">{c.activities.map((a)=><li key={a.id} className="px-4 py-3"><p className="text-sm">{a.message}</p><p className="mt-1 text-xs text-muted2">{a.user?`${a.user.firstName} ${a.user.lastName} · `:""}{formatDateTime(a.createdAt)}</p></li>)}</ul>:<p className="p-4 text-sm text-muted2">No activity yet.</p>}</CardContent></Card>
      </div>
    </div>
  </div>;
}

function Metric({icon:Icon,label,value,sub}:{icon:any;label:string;value:string;sub:string}){return <Card><CardContent className="p-4"><Icon className="h-4 w-4 text-electric"/><p className="mt-3 text-xs text-muted2">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-muted2">{sub}</p></CardContent></Card>}
function Money({label,value,currency}:{label:string;value:number;currency:string}){return <div><p className="text-xs uppercase tracking-wide text-muted2">{label}</p><p className={`mt-1 font-semibold ${value<0?"text-red-600":""}`}>{formatMoney(value,currency)}</p></div>}
function Info({label,children}:{label:string;children:React.ReactNode}){return <div><p className="text-xs uppercase tracking-wide text-muted2">{label}</p><div className="mt-1 text-sm">{children}</div></div>}
