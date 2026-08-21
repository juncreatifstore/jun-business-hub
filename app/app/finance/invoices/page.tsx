import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getAccountsReceivableSnapshot, listInvoices } from "@/lib/finance-invoices";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/utils";
import { AlertTriangle, CircleDollarSign, Clock3, FileText } from "lucide-react";

export const dynamic="force-dynamic";
export default async function InvoicesPage(){
  await requirePermission("INVOICE_READ");
  const [invoices,snapshot]=await Promise.all([listInvoices(),getAccountsReceivableSnapshot()]);
  const clientIds=[...new Set(invoices.map(i=>i.clientId))];
  const clients=await prisma.client.findMany({where:{id:{in:clientIds}},select:{id:true,firstName:true,lastName:true,internalId:true}});
  const clientMap=new Map(clients.map(c=>[c.id,c]));
  const stateById=new Map(snapshot.rows.map(r=>[r.invoice.id,r]));
  const overdue=snapshot.rows.filter(r=>r.overdue&&r.balance>0).length;
  const open=snapshot.rows.filter(r=>r.balance>0).length;
  const paid=invoices.filter(i=>stateById.get(i.id)?.effectiveStatus==="PAID").length;
  return <div><PageHeader title="Invoices & Accounts Receivable" subtitle="Client invoices, balances due, aging, reminders and payment collection." actionHref="/app/finance/invoices/new" actionLabel="New invoice"/>
    <div className="mb-5 grid gap-3 sm:grid-cols-4"><Metric icon={FileText} label="Invoices" value={invoices.length}/><Metric icon={Clock3} label="Open receivables" value={open}/><Metric icon={AlertTriangle} label="Overdue" value={overdue}/><Metric icon={CircleDollarSign} label="Paid" value={paid}/></div>
    {snapshot.byCurrency.length?<div className="mb-5 grid gap-3 xl:grid-cols-3">{snapshot.byCurrency.map(r=><Card key={r.currency}><CardContent className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted2">AR aging · {r.currency}</div><div className="mt-2 text-2xl font-semibold">{formatMoney(r.total,r.currency)}</div><div className="mt-3 grid grid-cols-5 gap-2 text-xs"><Age label="Current" value={r.current} currency={r.currency}/><Age label="1–30" value={r.d1_30} currency={r.currency}/><Age label="31–60" value={r.d31_60} currency={r.currency}/><Age label="61–90" value={r.d61_90} currency={r.currency}/><Age label="90+" value={r.d90Plus} currency={r.currency}/></div></CardContent></Card>)}</div>:null}
    <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full text-sm"><thead className="border-b border-line bg-surface text-left text-xs text-muted2"><tr><th className="p-3">Invoice</th><th className="p-3">Client</th><th className="p-3">Total</th><th className="p-3">Paid</th><th className="p-3">Balance</th><th className="p-3">Due</th><th className="p-3">Aging</th><th className="p-3">Status</th></tr></thead><tbody>{invoices.map(i=>{const c=clientMap.get(i.clientId);const s=stateById.get(i.id);const status=s?.effectiveStatus||i.status;return <tr key={i.id} className="border-b border-line last:border-0"><td className="p-3"><Link href={`/app/finance/invoices/${i.id}`} className="registry-id hover:text-electric">{i.invoiceNumber}</Link><div className="text-xs text-muted2">{i.title}</div></td><td className="p-3">{c?`${c.firstName} ${c.lastName}`:"Unknown"}<div className="text-xs text-muted2">{c?.internalId||""}</div></td><td className="p-3 font-medium">{formatMoney(i.total,i.currency)}</td><td className="p-3">{formatMoney(s?.paid||0,i.currency)}</td><td className="p-3 font-medium">{formatMoney(s?.balance??i.total,i.currency)}</td><td className={`p-3 ${s?.overdue?"font-medium text-red-700":"text-muted2"}`}>{formatDate(new Date(i.dueDate))}</td><td className="p-3">{s?.aging?.replaceAll("_","–")||"—"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${status==="OVERDUE"?"bg-red-50 text-red-700":status==="PAID"?"bg-emerald-50 text-emerald-700":"bg-surface"}`}>{status.replaceAll("_"," ")}</span></td></tr>})}{!invoices.length?<tr><td colSpan={8} className="p-8 text-center text-muted2">No invoices yet.</td></tr>:null}</tbody></table></div>
  </div>;
}
function Metric({icon:Icon,label,value}:{icon:typeof FileText;label:string;value:number}){return <Card><CardContent className="p-4"><Icon className="mb-2 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="text-2xl font-semibold">{value}</div></CardContent></Card>}
function Age({label,value,currency}:{label:string;value:number;currency:string}){return <div><div className="text-muted2">{label}</div><div className="font-medium">{formatMoney(value,currency)}</div></div>}
