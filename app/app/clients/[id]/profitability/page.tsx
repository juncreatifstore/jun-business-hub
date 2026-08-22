import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientProfitabilityOverview } from "@/lib/client-profitability-overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";
import { AlertTriangle, CircleDollarSign, ReceiptText, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

export const dynamic="force-dynamic";

export default async function ClientProfitabilityPage({params}:{params:Promise<{id:string}>|{id:string}}){
  await requirePermission("CLIENT_READ");
  const {id}=await Promise.resolve(params);
  const [client,data]=await Promise.all([
    prisma.client.findUnique({where:{id},select:{id:true,internalId:true,firstName:true,lastName:true,status:true}}),
    getClientProfitabilityOverview(id),
  ]);
  if(!client) notFound();
  const alertCount=data.alerts.lossServices.length+data.alerts.unpaidCommittedCosts.length+data.alerts.expensesWithoutCase.length+data.alerts.draftOrSubmittedExpenses.length;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="registry-id text-muted2">{client.internalId}</p><div className="mt-1 flex items-center gap-2"><h1 className="text-2xl font-semibold">{client.firstName} {client.lastName} · Profitability</h1><StatusBadge status={client.status}/></div><p className="mt-1 text-sm text-muted2">Expenses, service costs, refunds, realized profit and projected margin.</p></div>
      <div className="flex flex-wrap gap-2"><Link href={`/app/clients/${id}/dashboard`}><Button variant="outline">Client 360</Button></Link><Link href={`/app/clients/${id}/finance`}><Button variant="outline">Finance</Button></Link><Link href={`/app/clients/${id}/services`}><Button variant="outline">Services & Cases</Button></Link><Link href={`/app/finance/expenses/new?clientId=${id}`}><Button variant="primary">New expense</Button></Link></div>
    </div>

    {data.summaries.length===0?<Card><CardContent className="p-5 text-sm text-muted2">No revenue or expense activity has been recorded for this client yet.</CardContent></Card>:<div className="space-y-4">{data.summaries.map((s)=><Card key={s.currency}><CardHeader><div className="flex items-center justify-between"><CardTitle>{s.currency} profitability</CardTitle><Badge className="border border-line bg-surface text-muted2">CLIENT P&L</Badge></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      <Metric icon={WalletCards} label="Net received" value={formatMoney(s.netReceived,s.currency)}/>
      <Metric icon={ReceiptText} label="Refunds paid" value={`-${formatMoney(s.refundsPaid,s.currency)}`}/>
      <Metric icon={ReceiptText} label="Actual cost paid" value={`-${formatMoney(s.actualCost,s.currency)}`}/>
      <Metric icon={s.realizedProfit<0?TrendingDown:TrendingUp} label="Realized profit / loss" value={formatMoney(s.realizedProfit,s.currency)} tone={s.realizedProfit<0?"loss":s.realizedProfit>0?"profit":"neutral"}/>
      <Metric icon={CircleDollarSign} label="Realized margin" value={s.realizedMargin==null?"—":`${s.realizedMargin.toFixed(2)}%`}/>
    </div><div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4"><Small label="Approved refunds" value={formatMoney(s.approvedRefunds,s.currency)}/><Small label="Committed cost" value={formatMoney(s.committedCost,s.currency)}/><Small label="Open / unpaid cost" value={formatMoney(s.openCost,s.currency)}/><Small label="Projected profit" value={formatMoney(s.projectedProfit,s.currency)} tone={s.projectedProfit<0?"loss":s.projectedProfit>0?"profit":"neutral"}/></div><p className="mt-3 text-xs text-muted2">Realized profit = net received − refunds actually paid − expenses actually paid. Projected profit = net received − approved refunds − committed expenses.</p></CardContent></Card>)}</div>}

    {alertCount>0?<Card><CardHeader><CardTitle>Profitability attention</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><AlertBox title="Services in loss" count={data.alerts.lossServices.length} text="At least one service currently has negative realized profit."/><AlertBox title="Committed cost unpaid" count={data.alerts.unpaidCommittedCosts.length} text="Approved service costs remain partially or fully unpaid."/><AlertBox title="Expenses without case" count={data.alerts.expensesWithoutCase.length} text="Client expenses are not assigned to a service/case."/><AlertBox title="Expenses awaiting approval" count={data.alerts.draftOrSubmittedExpenses.length} text="Draft or submitted costs are not yet committed."/></CardContent></Card>:null}

    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Service profitability</CardTitle><Link href={`/app/clients/${id}/services`} className="text-sm font-medium text-electric hover:underline">Open Services & Cases</Link></div></CardHeader><CardContent className="p-0">{data.services.length===0?<p className="p-5 text-sm text-muted2">No service/case yet.</p>:<div className="overflow-x-auto"><Table><THead><tr><TH>Service</TH><TH>Currency</TH><TH>Net received</TH><TH>Actual cost</TH><TH>Committed cost</TH><TH>Profit / loss</TH><TH>Margin</TH></tr></THead><tbody>{data.services.flatMap((s)=>s.currencies.length?s.currencies.map((c)=><TR key={`${s.caseId}-${c.currency}`}><TD><Link href={`/app/cases/${s.caseId}`} className="font-medium hover:text-electric">{s.title}</Link><div className="registry-id mt-1 text-xs text-muted2">{s.caseNumber}</div></TD><TD>{c.currency}</TD><TD>{formatMoney(c.netReceived,c.currency)}</TD><TD>{formatMoney(c.actualCost,c.currency)}</TD><TD className="text-muted2">{formatMoney(c.committedCost,c.currency)}</TD><TD className={c.profit<0?"font-semibold text-red-700":c.profit>0?"font-semibold text-emerald-700":"font-semibold"}>{formatMoney(c.profit,c.currency)}</TD><TD>{c.marginPercent==null?"—":`${c.marginPercent.toFixed(2)}%`}</TD></TR>):[<TR key={s.caseId}><TD><Link href={`/app/cases/${s.caseId}`} className="font-medium hover:text-electric">{s.title}</Link><div className="registry-id mt-1 text-xs text-muted2">{s.caseNumber}</div></TD><TD colSpan={6} className="text-muted2">No linked financial activity</TD></TR>])}</tbody></Table></div>}</CardContent></Card>

    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>Client expenses</CardTitle><Link href={`/app/finance/expenses/new?clientId=${id}`} className="text-sm font-medium text-electric hover:underline">Record expense</Link></div></CardHeader><CardContent className="p-0">{data.expenses.length===0?<p className="p-5 text-sm text-muted2">No expenses linked to this client.</p>:<div className="overflow-x-auto"><Table><THead><tr><TH>Expense</TH><TH>Vendor / category</TH><TH>Service</TH><TH>Total</TH><TH>Paid</TH><TH>Remaining</TH><TH>Status</TH></tr></THead><tbody>{data.expenses.map((e)=><TR key={e.id}><TD><Link href={`/app/finance/expenses/${e.id}`} className="registry-id hover:text-electric">{e.expenseNumber}</Link><div className="mt-1 text-xs text-muted2">{formatDate(new Date(e.createdAt))}</div></TD><TD><div className="font-medium">{e.vendorName}</div><div className="text-xs text-muted2">{e.category.replaceAll("_"," ")}</div></TD><TD>{e.caseId?<Link href={`/app/cases/${e.caseId}`} className="text-electric hover:underline">Open case</Link>:<span className="text-amber-700">Not assigned</span>}</TD><TD>{formatMoney(e.amount,e.currency)}</TD><TD>{formatMoney(e.paidTotal,e.currency)}</TD><TD>{formatMoney(e.remaining,e.currency)}</TD><TD><StatusBadge status={e.effectiveStatus}/></TD></TR>)}</tbody></Table></div>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Profitability rules</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm md:grid-cols-2"><Rule title="Transfer fees" text="Transfer-provider fees are removed before revenue enters profitability calculations."/><Rule title="Actual service cost" text="Only outgoing expense payments actually made by JUN reduce realized profit."/><Rule title="Committed cost" text="Approved vendor expenses reduce projected profit even if JUN has not paid them yet."/><Rule title="Refund impact" text="Paid refunds reduce realized profit; approved refunds reduce projected profit."/></CardContent></Card>
  </div>;
}

function Metric({icon:Icon,label,value,tone="neutral"}:{icon:typeof CircleDollarSign;label:string;value:string;tone?:"neutral"|"profit"|"loss"}){return <div className="rounded-xl border border-line bg-surface/40 p-3"><Icon className={`mb-2 h-4 w-4 ${tone==="loss"?"text-red-600":tone==="profit"?"text-emerald-700":"text-electric"}`}/><div className="text-xs text-muted2">{label}</div><div className={`mt-1 break-words font-semibold ${tone==="loss"?"text-red-700":tone==="profit"?"text-emerald-700":""}`}>{value}</div></div>}
function Small({label,value,tone="neutral"}:{label:string;value:string;tone?:"neutral"|"profit"|"loss"}){return <div><div className="text-xs text-muted2">{label}</div><div className={`mt-1 font-semibold ${tone==="loss"?"text-red-700":tone==="profit"?"text-emerald-700":""}`}>{value}</div></div>}
function AlertBox({title,count,text}:{title:string;count:number;text:string}){return <div className={count?"rounded-xl border border-amber-200 bg-amber-50 p-4":"rounded-xl border border-line bg-surface p-4"}><div className="flex items-center justify-between gap-2"><div className="font-medium">{title}</div><Badge className={count?"border border-amber-200 bg-white text-amber-800":"border border-line bg-white text-muted2"}>{count}</Badge></div><div className="mt-1 text-xs text-muted2">{text}</div></div>}
function Rule({title,text}:{title:string;text:string}){return <div className="rounded-xl border border-line p-4"><div className="font-medium">{title}</div><div className="mt-1 text-xs text-muted2">{text}</div></div>}
