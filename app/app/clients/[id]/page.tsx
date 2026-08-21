import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount } from "@/lib/client-financial-account";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDate, formatDateTime, formatMoney, cn } from "@/lib/utils";
import { addClientNote, archiveClient } from "@/services/clients";

export const dynamic = "force-dynamic";

const TABS = ["overview", "account", "cases", "documents", "contracts", "payments", "refunds", "emails", "notes", "activity"] as const;
type Tab = (typeof TABS)[number];

function moneyList(rows: Array<{ currency: string; value: number }>) {
  if (!rows.length) return formatMoney(0, "USD");
  return rows.map((r) => formatMoney(r.value, r.currency)).join(" · ");
}

export default async function ClientDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const user = await requirePermission("CLIENT_READ");
  const tab: Tab = (TABS as readonly string[]).includes(searchParams.tab ?? "") ? searchParams.tab as Tab : "overview";
  const [client, account] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.id },
      include: {
        owner: true, tags: true,
        cases: { orderBy: { createdAt: "desc" }, include: { owner: true } },
        documents: { orderBy: { updatedAt: "desc" } },
        payments: { orderBy: { paidAt: "desc" } },
        refunds: { orderBy: { createdAt: "desc" } },
        files: { orderBy: { createdAt: "desc" }, where: { isVault: false } },
        mailThreads: { orderBy: { updatedAt: "desc" } },
        clientNotes: { orderBy: { createdAt: "desc" }, include: { author: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 30, include: { user: true } },
      },
    }),
    getClientFinancialAccount(params.id),
  ]);
  if (!client) notFound();

  const contracts = client.documents.filter((d) => ["CONTRACT", "AGREEMENT", "REFUND_AGREEMENT"].includes(d.type));
  const balanceText = moneyList(account.balances.map((b) => ({ currency: b.currency, value: b.available })));
  const fundsText = moneyList(account.balances.map((b) => ({ currency: b.currency, value: b.confirmedFunds })));
  const refundsText = moneyList(account.balances.filter((b) => b.activeRefunds).map((b) => ({ currency: b.currency, value: b.activeRefunds })));
  const commissionsText = moneyList(account.balances.filter((b) => b.commissions).map((b) => ({ currency: b.currency, value: b.commissions })));
  const noteAction = addClientNote.bind(null, client.id);
  const archiveAction = archiveClient.bind(null, client.id);

  return <div>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-3"><h1 className="text-xl font-semibold">{client.firstName} {client.lastName}</h1><StatusBadge status={client.status} />{account.profile.isPartner ? <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">PARTNER</Badge> : null}</div><p className="registry-id mt-1 text-muted2">{client.internalId} · since {formatDate(client.createdAt)}</p><div className="mt-2 flex flex-wrap gap-1">{client.tags.map((t) => <Badge key={t.id} className="border border-line bg-surface text-muted2">{t.tag}</Badge>)}</div></div>
      <div className="flex flex-wrap gap-2"><Link href={`/app/clients/${client.id}/statement`}><Button variant="outline">Statement</Button></Link><Link href={`/app/clients/${client.id}/account`}><Button variant="outline">Financial account</Button></Link>{can(user,"CLIENT_UPDATE")?<Link href={`/app/clients/${client.id}/edit`}><Button variant="outline">Edit</Button></Link>:null}{can(user,"CLIENT_ARCHIVE")&&client.status!=="ARCHIVED"?<form action={archiveAction}><Button variant="ghost" className="text-red-600">Archive</Button></form>:null}</div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {[{label:"Available balance",value:balanceText},{label:"Confirmed funds",value:fundsText},{label:"Refunds / withdrawals",value:refundsText},{label:"Commissions",value:commissionsText},{label:"Cases",value:String(client.cases.length)},{label:"Contracts",value:String(contracts.length)}].map((m)=><Card key={m.label}><CardContent className="p-4"><p className="text-xs text-muted2">{m.label}</p><p className="mt-1 break-words text-xl font-semibold">{m.value}</p></CardContent></Card>)}
    </div>

    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line">{TABS.map((t)=><Link key={t} href={`/app/clients/${client.id}?tab=${t}`} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm capitalize",tab===t?"border-electric font-medium text-electric":"border-transparent text-muted2 hover:text-ink")}>{t}</Link>)}</div>

    {tab==="overview"?<div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Contact & identity</CardTitle></CardHeader><CardContent><dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{[["Email",client.email],["Phone",client.phone],["WhatsApp",client.whatsapp],["Country",client.country],["Nationality",client.nationality],["Birth date",client.birthDate?formatDate(client.birthDate):null],["Address",client.address],["Owner",client.owner?`${client.owner.firstName} ${client.owner.lastName}`:null],["Statement language",account.profile.preferredLanguage],["Partner",account.profile.isPartner?"Yes":"No"]].map(([k,v])=><div key={String(k)}><dt className="text-xs text-muted2">{k}</dt><dd className="mt-0.5">{v??"—"}</dd></div>)}</dl>{client.notes?<div className="mt-4 rounded-lg bg-surface p-3 text-sm"><p className="text-xs text-muted2">Notes</p><p className="mt-1 whitespace-pre-wrap">{client.notes}</p></div>:null}</CardContent></Card><Card><CardHeader><CardTitle>Timeline</CardTitle></CardHeader><CardContent className="p-0">{client.activities.length===0?<p className="p-5 text-sm text-muted2">No activity recorded yet for this client.</p>:<ul className="divide-y divide-line">{client.activities.slice(0,10).map((a)=><li key={a.id} className="px-5 py-3"><p className="text-sm">{a.message}</p><p className="text-xs text-muted2">{a.user?`${a.user.firstName} ${a.user.lastName} · `:""}{formatDateTime(a.createdAt)}</p></li>)}</ul>}</CardContent></Card></div>:null}

    {tab==="account"?<div className="space-y-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{account.balances.map((b)=><Card key={b.currency}><CardHeader><CardTitle>{b.currency}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="text-2xl font-semibold">{formatMoney(b.available,b.currency)}</div><div className="flex justify-between"><span className="text-muted2">Confirmed funds</span><strong>{formatMoney(b.confirmedFunds,b.currency)}</strong></div><div className="flex justify-between"><span className="text-muted2">Commissions</span><strong>+{formatMoney(b.commissions,b.currency)}</strong></div><div className="flex justify-between"><span className="text-muted2">Active refunds</span><strong>-{formatMoney(b.activeRefunds,b.currency)}</strong></div><div className="flex justify-between"><span className="text-muted2">Actually paid out</span><strong>{formatMoney(b.refundsPaid,b.currency)}</strong></div></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Financial account</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm">{account.profile.isPartner?"Partner account enabled":"Standard client account"} · Statement language {account.profile.preferredLanguage}</p><p className="mt-1 text-xs text-muted2">Refunds can debit the global account balance without being tied to one specific payment.</p></div><div className="flex gap-2"><Link href={`/app/clients/${client.id}/account`}><Button variant="primary">Manage account</Button></Link><Link href={`/app/clients/${client.id}/statement`}><Button variant="outline">Generate statement</Button></Link></div></CardContent></Card></div>:null}

    {tab==="cases"?(client.cases.length===0?<p className="text-sm text-muted2">No cases for this client. <Link className="text-electric hover:underline" href={`/app/cases/new?clientId=${client.id}`}>Open the first case</Link>.</p>:<Table><THead><tr><TH>Case</TH><TH>Title</TH><TH>Status</TH><TH>Priority</TH><TH>Owner</TH><TH>Due</TH></tr></THead><tbody>{client.cases.map((c)=><TR key={c.id}><TD><Link href={`/app/cases/${c.id}`} className="registry-id hover:text-electric">{c.caseNumber}</Link></TD><TD><Link href={`/app/cases/${c.id}`} className="font-medium hover:text-electric">{c.title}</Link></TD><TD><StatusBadge status={c.status}/></TD><TD><StatusBadge status={c.priority}/></TD><TD className="text-muted2">{c.owner?`${c.owner.firstName} ${c.owner.lastName}`:"—"}</TD><TD className="text-muted2">{formatDate(c.dueDate)}</TD></TR>)}</tbody></Table>):null}

    {tab==="documents"?(client.files.length===0&&client.documents.length===0?<p className="text-sm text-muted2">No documents or files linked to this client yet.</p>:<div className="space-y-6">{client.documents.length?<Table><THead><tr><TH>Registry ID</TH><TH>Title</TH><TH>Type</TH><TH>Status</TH><TH>Updated</TH></tr></THead><tbody>{client.documents.map((d)=><TR key={d.id}><TD><span className="registry-id">{d.documentId}</span></TD><TD><Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">{d.title}</Link></TD><TD className="text-muted2">{d.type.replaceAll("_"," ")}</TD><TD><StatusBadge status={d.status}/></TD><TD className="text-muted2">{formatDate(d.updatedAt)}</TD></TR>)}</tbody></Table>:null}{client.files.length?<Table><THead><tr><TH>File</TH><TH>Category</TH><TH>Size</TH><TH>Uploaded</TH></tr></THead><tbody>{client.files.map((f)=><TR key={f.id}><TD><Link href={`/api/files/${f.id}`} className="font-medium hover:text-electric">{f.name}</Link></TD><TD className="text-muted2">{f.category.replaceAll("_"," ")}</TD><TD className="text-muted2">{(f.sizeBytes/1024).toFixed(0)} KB</TD><TD className="text-muted2">{formatDate(f.createdAt)}</TD></TR>)}</tbody></Table>:null}</div>):null}

    {tab==="contracts"?(contracts.length===0?<p className="text-sm text-muted2">No contracts yet.</p>:<Table><THead><tr><TH>Registry ID</TH><TH>Title</TH><TH>Status</TH><TH>Updated</TH></tr></THead><tbody>{contracts.map((d)=><TR key={d.id}><TD><span className="registry-id">{d.documentId}</span></TD><TD><Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">{d.title}</Link></TD><TD><StatusBadge status={d.status}/></TD><TD className="text-muted2">{formatDate(d.updatedAt)}</TD></TR>)}</tbody></Table>):null}

    {tab==="payments"?(client.payments.length===0?<p className="text-sm text-muted2">No payments recorded.</p>:<Table><THead><tr><TH>Reference</TH><TH>Amount</TH><TH>Method</TH><TH>Status</TH><TH>Date</TH></tr></THead><tbody>{client.payments.map((p)=><TR key={p.id}><TD><Link href={`/app/finance/payments/${p.id}`} className="registry-id hover:text-electric">{p.reference}</Link></TD><TD className="font-medium">{formatMoney(Number(p.amount),p.currency)}</TD><TD className="text-muted2">{p.method.replaceAll("_"," ")}</TD><TD><StatusBadge status={p.status}/></TD><TD className="text-muted2">{formatDate(p.paidAt)}</TD></TR>)}</tbody></Table>):null}

    {tab==="refunds"?(client.refunds.length===0?<p className="text-sm text-muted2">No refunds for this client.</p>:<Table><THead><tr><TH>Reference</TH><TH>Amount</TH><TH>Reason</TH><TH>Status</TH><TH>Linked payment</TH><TH>Created</TH></tr></THead><tbody>{client.refunds.map((r)=><TR key={r.id}><TD><Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.refundNumber}</Link></TD><TD className="font-medium">-{formatMoney(Number(r.amount),r.currency)}</TD><TD className="max-w-xs truncate text-muted2">{r.reason}</TD><TD><StatusBadge status={r.status}/></TD><TD className="text-muted2">{r.paymentId?"Linked":"Global balance"}</TD><TD className="text-muted2">{formatDate(r.createdAt)}</TD></TR>)}</tbody></Table>):null}

    {tab==="emails"?(client.mailThreads.length===0?<p className="text-sm text-muted2">No email threads linked to this client.</p>:<ul className="space-y-2">{client.mailThreads.map((t)=><li key={t.id}><Card><CardContent className="p-4"><div className="flex items-center justify-between gap-3"><Link href={`/app/mail?thread=${t.id}`} className="font-medium hover:text-electric">{t.subject??"(No subject)"}</Link>{t.requiresAttention?<StatusBadge status="ATTENTION"/>:null}</div>{t.snippet?<p className="mt-1 line-clamp-2 text-sm text-muted2">{t.snippet}</p>:null}</CardContent></Card></li>)}</ul>):null}

    {tab==="notes"?<div className="max-w-2xl space-y-4">{can(user,"CLIENT_UPDATE")?<form action={noteAction} className="space-y-2"><Textarea name="body" placeholder="Add a note visible to the team…" rows={3} required maxLength={5000}/><Button variant="primary" size="sm">Add note</Button></form>:null}{client.clientNotes.length===0?<p className="text-sm text-muted2">No notes yet.</p>:<ul className="space-y-3">{client.clientNotes.map((n)=><li key={n.id} className="rounded-xl border border-line bg-white p-4"><p className="whitespace-pre-wrap text-sm">{n.body}</p><p className="mt-2 text-xs text-muted2">{n.author.firstName} {n.author.lastName} · {formatDateTime(n.createdAt)}</p></li>)}</ul>}</div>:null}

    {tab==="activity"?(client.activities.length===0?<p className="text-sm text-muted2">Nothing recorded yet.</p>:<ul className="max-w-2xl divide-y divide-line rounded-xl border border-line bg-white">{client.activities.map((a)=><li key={a.id} className="px-5 py-3"><p className="text-sm">{a.message}</p><p className="text-xs text-muted2">{a.user?`${a.user.firstName} ${a.user.lastName} · `:""}{formatDateTime(a.createdAt)}</p></li>)}</ul>):null}
  </div>;
}
