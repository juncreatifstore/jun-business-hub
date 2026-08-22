import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount } from "@/lib/client-financial-account";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { CircleDollarSign, FileText, FolderOpen, Mail, Phone, UserRound, WalletCards, AlertTriangle, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

function moneyList(rows: Array<{ currency: string; value: number }>) {
  if (!rows.length) return formatMoney(0, "USD");
  return rows.map((r) => formatMoney(r.value, r.currency)).join(" · ");
}

export default async function Client360Page({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  await requirePermission("CLIENT_READ");
  const resolved = await Promise.resolve(params);
  const id = resolved.id;

  const [client, account] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        owner: true,
        tags: true,
        cases: { orderBy: { createdAt: "desc" }, include: { owner: true } },
        documents: { orderBy: { updatedAt: "desc" }, take: 8 },
        payments: { orderBy: { paidAt: "desc" }, take: 8 },
        refunds: { orderBy: { createdAt: "desc" }, take: 8 },
        files: { where: { isVault: false }, orderBy: { createdAt: "desc" }, take: 8 },
        activities: { orderBy: { createdAt: "desc" }, take: 12, include: { user: true } },
      },
    }),
    getClientFinancialAccount(id),
  ]);
  if (!client) notFound();

  const activeCases = client.cases.filter((c) => !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(c.status));
  const contracts = client.documents.filter((d) => ["CONTRACT", "AGREEMENT", "REFUND_AGREEMENT"].includes(d.type));
  const confirmedNet = moneyList(account.balances.map((b) => ({ currency: b.currency, value: b.confirmedFunds })));
  const available = moneyList(account.balances.map((b) => ({ currency: b.currency, value: b.available })));
  const pendingRefunds = moneyList(account.balances.filter((b) => b.pendingRefunds > 0).map((b) => ({ currency: b.currency, value: b.pendingRefunds })));

  const profileChecks = [
    { label: "Email", ok: Boolean(client.email) },
    { label: "Phone", ok: Boolean(client.phone) },
    { label: "Address", ok: Boolean(client.address) },
    { label: "Country", ok: Boolean(client.country) },
    { label: "Nationality", ok: Boolean(client.nationality) },
    { label: "Birth date", ok: Boolean(client.birthDate) },
    { label: "Owner", ok: Boolean(client.ownerId) },
  ];
  const completed = profileChecks.filter((x) => x.ok).length;
  const profilePercent = Math.round((completed / profileChecks.length) * 100);
  const needsAttention = profileChecks.filter((x) => !x.ok);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold">{client.firstName} {client.lastName}</h1><StatusBadge status={client.status}/>{account.profile.isPartner?<Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">PARTNER</Badge>:null}</div>
        <p className="registry-id mt-1 text-muted2">{client.internalId} · client since {formatDate(client.createdAt)}</p>
        <div className="mt-2 flex flex-wrap gap-1">{client.tags.map((t)=><Badge key={t.id} className="border border-line bg-surface text-muted2">{t.tag}</Badge>)}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/app/clients/${client.id}`}><Button variant="outline">Full record</Button></Link>
        <Link href={`/app/clients/${client.id}/statement`}><Button variant="outline">Statement</Button></Link>
        <Link href={`/app/clients/${client.id}/account`}><Button variant="outline">Financial account</Button></Link>
        {can(await requirePermission("CLIENT_READ"),"CLIENT_UPDATE")?<Link href={`/app/clients/${client.id}/edit`}><Button variant="primary">Edit profile</Button></Link>:null}
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={CircleDollarSign} label="Net confirmed funds" value={confirmedNet} hint="After payment/transfer fees"/>
      <Metric icon={WalletCards} label="Available balance" value={available} hint="After refunds and withdrawals"/>
      <Metric icon={FolderOpen} label="Active cases" value={String(activeCases.length)} hint={`${client.cases.length} total cases`}/>
      <Metric icon={FileText} label="Documents" value={String(client.documents.length + client.files.length)} hint={`${contracts.length} contracts/agreement(s)`}/>
      <Metric icon={AlertTriangle} label="Pending refunds" value={pendingRefunds} hint={`${client.refunds.filter(r=>["REQUESTED","UNDER_REVIEW"].includes(r.status)).length} awaiting decision`}/>
      <Metric icon={CheckCircle2} label="Profile completeness" value={`${profilePercent}%`} hint={`${completed}/${profileChecks.length} core fields`}/>
    </div>

    {needsAttention.length?<Card><CardHeader><CardTitle>Client file attention</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted2">Missing core information:</span>{needsAttention.map((x)=><Badge key={x.label} className="border border-amber-200 bg-amber-50 text-amber-800">{x.label}</Badge>)}<Link href={`/app/clients/${client.id}/edit`} className="ml-auto text-sm font-medium text-electric hover:underline">Complete profile</Link></div></CardContent></Card>:null}

    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card><CardHeader><CardTitle>Identity & contact</CardTitle></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Info icon={UserRound} label="Full name" value={`${client.firstName} ${client.lastName}`}/>
        <Info icon={UserRound} label="Responsible owner" value={client.owner?`${client.owner.firstName} ${client.owner.lastName}`:"Unassigned"}/>
        <Info icon={Mail} label="Email" value={client.email||"—"}/>
        <Info icon={Phone} label="Phone" value={client.phone||"—"}/>
        <Info icon={Phone} label="WhatsApp" value={client.whatsapp||"—"}/>
        <Info icon={UserRound} label="Nationality" value={client.nationality||"—"}/>
        <Info icon={UserRound} label="Country" value={client.country||"—"}/>
        <Info icon={UserRound} label="Birth date" value={client.birthDate?formatDate(client.birthDate):"—"}/>
        <div className="sm:col-span-2"><div className="text-xs text-muted2">Address</div><div className="mt-1 font-medium">{client.address||"—"}</div></div>
        <div><div className="text-xs text-muted2">Statement language</div><div className="mt-1 font-medium">{account.profile.preferredLanguage}</div></div>
        <div><div className="text-xs text-muted2">Account type</div><div className="mt-1 font-medium">{account.profile.isPartner?"Partner":"Standard client"}</div></div>
      </dl></CardContent></Card>

      <Card><CardHeader><CardTitle>Quick actions</CardTitle></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2">
        <Quick href={`/app/cases/new?clientId=${client.id}`} title="Open a case" text="Create a new service or travel case."/>
        <Quick href={`/app/finance/invoices/new?clientId=${client.id}`} title="Create invoice" text="Bill a service to this client."/>
        <Quick href={`/app/finance/payments/new?clientId=${client.id}`} title="Record payment" text="Record money received from the client."/>
        <Quick href={`/app/clients/${client.id}?tab=documents`} title="Documents" text="Open documents and client files."/>
        <Quick href={`/app/clients/${client.id}?tab=notes`} title="Team notes" text="Read or add internal notes."/>
        <Quick href={`/app/clients/${client.id}/statement`} title="Client statement" text="Review the complete financial statement."/>
      </CardContent></Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Current cases</CardTitle></CardHeader><CardContent className="p-0">{activeCases.length?<div className="divide-y divide-line">{activeCases.slice(0,6).map((c)=><Link key={c.id} href={`/app/cases/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface"><div><div className="font-medium">{c.title}</div><div className="registry-id mt-0.5 text-xs text-muted2">{c.caseNumber}</div></div><div className="text-right"><StatusBadge status={c.status}/><div className="mt-1 text-xs text-muted2">{c.owner?`${c.owner.firstName} ${c.owner.lastName}`:"Unassigned"}</div></div></Link>)}</div>:<p className="p-5 text-sm text-muted2">No active case. Open a case when the client starts a service.</p>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="p-0">{client.activities.length?<div className="divide-y divide-line">{client.activities.slice(0,8).map((a)=><div key={a.id} className="px-5 py-3"><div className="text-sm">{a.message}</div><div className="mt-1 text-xs text-muted2">{a.user?`${a.user.firstName} ${a.user.lastName} · `:""}{formatDateTime(a.createdAt)}</div></div>)}</div>:<p className="p-5 text-sm text-muted2">No activity recorded yet.</p>}</CardContent></Card>
    </div>
  </div>;
}

function Metric({icon:Icon,label,value,hint}:{icon:typeof CircleDollarSign;label:string;value:string;hint:string}){return <Card><CardContent className="p-4"><Icon className="mb-2 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="mt-1 break-words text-lg font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></CardContent></Card>}
function Info({icon:Icon,label,value}:{icon:typeof UserRound;label:string;value:string}){return <div><div className="flex items-center gap-1 text-xs text-muted2"><Icon className="h-3.5 w-3.5"/>{label}</div><div className="mt-1 break-words font-medium">{value}</div></div>}
function Quick({href,title,text}:{href:string;title:string;text:string}){return <Link href={href} className="rounded-xl border border-line p-4 transition hover:bg-surface"><div className="font-medium">{title}</div><div className="mt-1 text-xs text-muted2">{text}</div></Link>}
