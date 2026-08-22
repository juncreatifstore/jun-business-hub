import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientServiceSummaries } from "@/lib/client-service-summary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";
import { BriefcaseBusiness, CircleDollarSign, FileText, ReceiptText, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

function sumCurrency(rows: Array<{ currencies: Array<{ currency: string; [key: string]: number | string | null }> }>, key: string) {
  const map = new Map<string, number>();
  for (const row of rows) for (const c of row.currencies) map.set(c.currency, Math.round(((map.get(c.currency) || 0) + Number(c[key] || 0)) * 100) / 100);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => formatMoney(value, currency)).join(" · ") || formatMoney(0, "USD");
}

export default async function ClientServicesPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  await requirePermission("CLIENT_READ");
  const { id } = await Promise.resolve(params);
  const [client, services] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, internalId: true, status: true } }),
    getClientServiceSummaries(id),
  ]);
  if (!client) notFound();

  const active = services.filter((s) => !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(s.status));
  const totalProfit = sumCurrency(services, "profit");
  const totalReceived = sumCurrency(services, "netReceived");
  const totalCost = sumCurrency(services, "actualCost");

  return <div>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="registry-id text-muted2">{client.internalId}</p>
        <h1 className="mt-1 text-2xl font-semibold">Services & Cases · {client.firstName} {client.lastName}</h1>
        <p className="mt-1 text-sm text-muted2">Operational and financial view of every service JUN manages for this client.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/app/clients/${client.id}/dashboard`}><Button variant="outline">Client 360</Button></Link>
        <Link href={`/app/cases/new?clientId=${client.id}`}><Button variant="primary">New service / case</Button></Link>
      </div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={BriefcaseBusiness} label="Active services" value={String(active.length)} hint={`${services.length} total cases`} />
      <Metric icon={WalletCards} label="Net received" value={totalReceived} hint="After transfer / processing fees" />
      <Metric icon={ReceiptText} label="Actual service cost" value={totalCost} hint="Expenses actually paid by JUN" />
      <Metric icon={CircleDollarSign} label="Gross profit / loss" value={totalProfit} hint="Net received minus actual cost" />
    </div>

    {services.length === 0 ? <Card><CardContent className="p-6"><p className="text-sm text-muted2">No service or case has been created for this client yet.</p><Link href={`/app/cases/new?clientId=${client.id}`} className="mt-3 inline-block"><Button variant="primary">Create first service</Button></Link></CardContent></Card> : <div className="space-y-4">
      {services.map((service) => <Card key={service.caseId}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><Link href={`/app/cases/${service.caseId}`} className="text-lg font-semibold hover:text-electric">{service.title}</Link><StatusBadge status={service.status}/></div>
              <p className="registry-id mt-1 text-muted2">{service.caseNumber} · {service.type}</p>
            </div>
            <div className="flex gap-2"><Link href={`/app/finance/invoices/new?clientId=${client.id}&caseId=${service.caseId}`}><Button size="sm" variant="outline">Invoice</Button></Link><Link href={`/app/finance/expenses/new?clientId=${client.id}&caseId=${service.caseId}`}><Button size="sm" variant="outline">Expense</Button></Link><Link href={`/app/cases/${service.caseId}`}><Button size="sm" variant="primary">Open case</Button></Link></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
            <Info label="Owner" value={service.ownerName || "Unassigned"}/><Info label="Priority" value={service.priority.replaceAll("_", " ")}/><Info label="Due" value={service.dueDate ? formatDate(service.dueDate) : "—"}/><Info label="Open tasks" value={String(service.openTasks)}/><Info label="Documents" value={String(service.documentCount)}/>
          </div>
          {service.currencies.length === 0 ? <div className="rounded-lg border border-line bg-surface p-4 text-sm text-muted2">No financial activity linked to this service yet.</div> : <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted2"><tr><th className="px-3 py-2">Currency</th><th className="px-3 py-2">Billed</th><th className="px-3 py-2">Invoice paid</th><th className="px-3 py-2">Net received</th><th className="px-3 py-2">Transfer fees</th><th className="px-3 py-2">Actual cost</th><th className="px-3 py-2">Committed cost</th><th className="px-3 py-2">Profit / loss</th><th className="px-3 py-2">Margin</th></tr></thead>
              <tbody>{service.currencies.map((c) => <tr key={c.currency} className="border-t border-line"><td className="px-3 py-3 font-medium">{c.currency}</td><td className="px-3 py-3">{formatMoney(c.billed,c.currency)}</td><td className="px-3 py-3">{formatMoney(c.invoicePaid,c.currency)}</td><td className="px-3 py-3 font-medium">{formatMoney(c.netReceived,c.currency)}</td><td className="px-3 py-3 text-muted2">{formatMoney(c.transferFees,c.currency)}</td><td className="px-3 py-3">{formatMoney(c.actualCost,c.currency)}</td><td className="px-3 py-3 text-muted2">{formatMoney(c.committedCost,c.currency)}</td><td className={`px-3 py-3 font-semibold ${c.profit < 0 ? "text-red-600" : c.profit > 0 ? "text-emerald-700" : ""}`}>{formatMoney(c.profit,c.currency)}</td><td className="px-3 py-3">{c.marginPercent == null ? "—" : `${c.marginPercent.toFixed(2)}%`}</td></tr>)}</tbody>
            </table>
          </div>}
          <div className="flex flex-wrap gap-4 text-xs text-muted2"><span><FileText className="mr-1 inline h-3.5 w-3.5"/>{service.invoiceCount} invoice(s)</span><span><WalletCards className="mr-1 inline h-3.5 w-3.5"/>{service.paymentCount} payment(s)</span><span><ReceiptText className="mr-1 inline h-3.5 w-3.5"/>{service.expenseCount} expense(s)</span></div>
        </CardContent>
      </Card>)}
    </div>}
  </div>;
}

function Metric({icon:Icon,label,value,hint}:{icon:typeof BriefcaseBusiness;label:string;value:string;hint:string}){return <Card><CardContent className="p-4"><Icon className="mb-3 h-5 w-5 text-electric"/><p className="text-xs text-muted2">{label}</p><p className="mt-1 break-words text-lg font-semibold">{value}</p><p className="mt-1 text-xs text-muted2">{hint}</p></CardContent></Card>}
function Info({label,value}:{label:string;value:string}){return <div><div className="text-xs text-muted2">{label}</div><div className="mt-1 font-medium">{value}</div></div>}
