import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";
import { AlertTriangle, Banknote, CircleDollarSign, FileText, ReceiptText, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientFinancePage({params}:{params:Promise<{id:string}>|{id:string}}){
  await requirePermission("CLIENT_READ");
  const {id}=await Promise.resolve(params);
  const [client,finance]=await Promise.all([
    prisma.client.findUnique({where:{id},select:{id:true,internalId:true,firstName:true,lastName:true,status:true}}),
    getClientFinanceOverview(id),
  ]);
  if(!client) notFound();

  const alertCount=finance.alerts.overallocatedPayments.length+finance.alerts.overdueInvoices.length+finance.alerts.pendingPayments.length+finance.alerts.pendingRefunds.length;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="registry-id text-muted2">{client.internalId}</p><div className="mt-1 flex items-center gap-2"><h1 className="text-2xl font-semibold">{client.firstName} {client.lastName} · Finance</h1><StatusBadge status={client.status}/></div><p className="mt-1 text-sm text-muted2">Invoices, gross payments, transfer fees, net receipts, allocations, balances and refunds.</p></div>
      <div className="flex flex-wrap gap-2"><Link href={`/app/clients/${id}/dashboard`}><Button variant="outline">Client 360</Button></Link><Link href={`/app/clients/${id}/services`}><Button variant="outline">Services & Cases</Button></Link><Link href={`/app/clients/${id}/statement`}><Button variant="outline">Statement</Button></Link><Link href={`/app/finance/invoices/new?clientId=${id}`}><Button variant="primary">New invoice</Button></Link></div>
    </div>

    {finance.summaries.length===0?<Card><CardContent className="p-5 text-sm text-muted2">No financial activity recorded for this client yet.</CardContent></Card>:<div className="space-y-4">{finance.summaries.map((s)=><Card key={s.currency}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{s.currency} financial position</CardTitle><Badge className="border border-line bg-surface text-muted2">NET BASIS</Badge></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <Metric icon={CircleDollarSign} label="Gross sent" value={formatMoney(s.grossReceived,s.currency)}/>
      <Metric icon={Banknote} label="Transfer fees" value={`-${formatMoney(s.fees,s.currency)}`}/>
      <Metric icon={WalletCards} label="Net received" value={formatMoney(s.netReceived,s.currency)}/>
      <Metric icon={ReceiptText} label="Applied" value={formatMoney(s.appliedToInvoices,s.currency)}/>
      <Metric icon={WalletCards} label="Unapplied" value={formatMoney(s.unappliedFunds,s.currency)}/>
      <Metric icon={FileText} label="Billed" value={formatMoney(s.billed,s.currency)}/>
      <Metric icon={CircleDollarSign} label="Invoice paid" value={formatMoney(s.invoicePaid,s.currency)}/>
      <Metric icon={AlertTriangle} label="Receivable" value={formatMoney(s.receivable,s.currency)}/>
    </div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-3 text-xs text-muted2"><span>Approved refunds: <strong className="text-ink">{formatMoney(s.approvedRefunds,s.currency)}</strong></span><span>Refunds actually paid: <strong className="text-ink">{formatMoney(s.refundPaid,s.currency)}</strong></span><span>Formula: Gross − Fees = Net received</span></div></CardContent></Card>)}</div>}

    {alertCount>0?<Card><CardHeader><CardTitle>Finance attention</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <AlertBox title="Overallocated payments" count={finance.alerts.overallocatedPayments.length} text="Invoice allocations exceed the net payment available."/>
      <AlertBox title="Overdue invoices" count={finance.alerts.overdueInvoices.length} text="Invoices still have an overdue balance."/>
      <AlertBox title="Pending payments" count={finance.alerts.pendingPayments.length} text="Payments still require confirmation."/>
      <AlertBox title="Pending refunds" count={finance.alerts.pendingRefunds.length} text="Refund requests are awaiting a decision."/>
    </CardContent></Card>:null}

    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Invoices</CardTitle><Link href={`/app/finance/invoices/new?clientId=${id}`} className="text-sm font-medium text-electric hover:underline">Create invoice</Link></div></CardHeader><CardContent className="p-0">{finance.invoices.length===0?<p className="p-5 text-sm text-muted2">No invoices for this client.</p>:<div className="overflow-x-auto"><Table><THead><tr><TH>Invoice</TH><TH>Service</TH><TH>Total</TH><TH>Paid</TH><TH>Balance</TH><TH>Status</TH><TH>Due</TH></tr></THead><tbody>{finance.invoices.map(({invoice,state})=><TR key={invoice.id}><TD><Link className="registry-id hover:text-electric" href={`/app/finance/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></TD><TD><div className="font-medium">{invoice.title}</div>{invoice.caseId?<Link href={`/app/cases/${invoice.caseId}`} className="text-xs text-electric hover:underline">Open case</Link>:<div className="text-xs text-muted2">No case linked</div>}</TD><TD className="font-medium">{formatMoney(invoice.total,invoice.currency)}</TD><TD className="text-emerald-700">{formatMoney(state.paid,invoice.currency)}</TD><TD className={state.balance>0?"font-medium text-amber-700":"font-medium text-emerald-700"}>{formatMoney(state.balance,invoice.currency)}</TD><TD><StatusBadge status={state.effectiveStatus}/></TD><TD className="text-muted2">{formatDate(new Date(invoice.dueDate))}</TD></TR>)}</tbody></Table></div>}</CardContent></Card>

    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Payments</CardTitle><Link href={`/app/finance/payments/new?clientId=${id}`} className="text-sm font-medium text-electric hover:underline">Record payment</Link></div></CardHeader><CardContent className="p-0">{finance.payments.length===0?<p className="p-5 text-sm text-muted2">No payments recorded.</p>:<div className="overflow-x-auto"><Table><THead><tr><TH>Reference</TH><TH>Gross</TH><TH>Fees</TH><TH>Net received</TH><TH>Applied</TH><TH>Unapplied</TH><TH>Status</TH><TH>Date</TH></tr></THead><tbody>{finance.payments.map((p)=><TR key={p.id}><TD><Link className="registry-id hover:text-electric" href={`/app/finance/payments/${p.id}`}>{p.reference}</Link><div className="mt-1 text-xs text-muted2">{p.serviceLabel||p.method.replaceAll("_"," ")}</div></TD><TD>{formatMoney(p.gross,p.currency)}</TD><TD className={p.fee>0?"text-red-700":"text-muted2"}>{p.fee>0?`-${formatMoney(p.fee,p.currency)}`:"—"}</TD><TD className="font-semibold">{formatMoney(p.net,p.currency)}</TD><TD>{formatMoney(p.applied,p.currency)}</TD><TD className={p.unapplied>0?"font-medium text-blue-700":"text-muted2"}>{formatMoney(p.unapplied,p.currency)}{p.overallocated>0?<div className="mt-1 text-xs text-red-700">Overallocated by {formatMoney(p.overallocated,p.currency)}</div>:null}</TD><TD><StatusBadge status={p.status}/></TD><TD className="text-muted2">{formatDate(p.paidAt||p.createdAt)}</TD></TR>)}</tbody></Table></div>}</CardContent></Card>

    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Refunds</CardTitle><Link href={`/app/finance/refunds/new?clientId=${id}`} className="text-sm font-medium text-electric hover:underline">New refund</Link></div></CardHeader><CardContent className="p-0">{finance.refunds.length===0?<p className="p-5 text-sm text-muted2">No refunds for this client.</p>:<div className="overflow-x-auto"><Table><THead><tr><TH>Reference</TH><TH>Requested</TH><TH>Paid</TH><TH>Remaining</TH><TH>Status</TH><TH>Reason</TH><TH>Created</TH></tr></THead><tbody>{finance.refunds.map((r)=><TR key={r.id}><TD><Link className="registry-id hover:text-electric" href={`/app/finance/refunds/${r.id}`}>{r.refundNumber}</Link></TD><TD>{formatMoney(r.amountNumber,r.currency)}</TD><TD className="text-red-700">{formatMoney(r.paidNumber,r.currency)}</TD><TD className="font-medium">{formatMoney(r.remainingNumber,r.currency)}</TD><TD><StatusBadge status={r.status}/></TD><TD className="max-w-xs truncate text-muted2">{r.reason}</TD><TD className="text-muted2">{formatDate(r.createdAt)}</TD></TR>)}</tbody></Table></div>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Finance rules used on this client</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm md:grid-cols-2"><Rule title="Payment amount" text="The gross amount records what the sender paid."/><Rule title="Transfer fee" text="Fees charged by the transfer provider are tracked separately and do not count as JUN revenue."/><Rule title="Net received" text="Gross payment minus transfer fees. This is the maximum amount available to apply to invoices."/><Rule title="Unapplied funds" text="Net money received that has not yet been allocated to an invoice. It is not automatically treated as revenue for a specific service."/></CardContent></Card>
  </div>;
}

function Metric({icon:Icon,label,value}:{icon:typeof CircleDollarSign;label:string;value:string}){return <div className="rounded-xl border border-line bg-surface/40 p-3"><Icon className="mb-2 h-4 w-4 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="mt-1 break-words font-semibold">{value}</div></div>}
function AlertBox({title,count,text}:{title:string;count:number;text:string}){return <div className={count?"rounded-xl border border-amber-200 bg-amber-50 p-4":"rounded-xl border border-line bg-surface/40 p-4"}><div className="flex items-center justify-between gap-2"><div className="font-medium">{title}</div><Badge className={count?"border border-amber-200 bg-white text-amber-800":"border border-line bg-white text-muted2"}>{count}</Badge></div><div className="mt-1 text-xs text-muted2">{text}</div></div>}
function Rule({title,text}:{title:string;text:string}){return <div className="rounded-xl border border-line p-4"><div className="font-medium">{title}</div><div className="mt-1 text-xs text-muted2">{text}</div></div>}
