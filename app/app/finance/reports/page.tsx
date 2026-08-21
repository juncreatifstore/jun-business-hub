import { requirePermission } from "@/lib/auth";
import { getFinanceControlCenter } from "@/lib/finance-control-center";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requirePermission("PAYMENT_READ");
  const data = await getFinanceControlCenter();

  return <div>
    <PageHeader title="Finance reports" subtitle="Multi-currency collections, fees, refunds and cash position. Currencies are never combined." />
    <div className="mb-4 flex justify-end"><a href="/api/finance/export.csv" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><Download className="h-4 w-4" />Export finance CSV</a></div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.currencies.map((row) => <Card key={row.currency}><CardHeader><CardTitle>{row.currency}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
        <Line label="Collected" value={formatMoney(row.collected,row.currency)} />
        <Line label="Estimated fees" value={formatMoney(row.fees,row.currency)} />
        <Line label="Refunds paid" value={formatMoney(row.refundsPaid,row.currency)} />
        <div className="border-t border-line pt-2"><Line label="Net cash" value={formatMoney(row.netCash,row.currency)} strong /></div>
        <p className="text-xs text-muted2">{row.paymentCount} confirmed payment{row.paymentCount === 1 ? "" : "s"}</p>
      </CardContent></Card>)}
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Current month</CardTitle></CardHeader><CardContent className="space-y-2">{data.monthCurrencies.length ? data.monthCurrencies.map((row) => <div key={row.currency} className="rounded-lg border border-line p-3"><div className="mb-2 registry-id">{row.currency}</div><Line label="Collections after fees" value={formatMoney(row.collected,row.currency)} /><Line label="Refund payouts" value={formatMoney(row.refunds,row.currency)} /><Line label="Net movement" value={formatMoney(row.net,row.currency)} strong /></div>) : <p className="text-sm text-muted2">No movement this month.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Payment methods</CardTitle></CardHeader><CardContent className="space-y-2">{data.methods.length ? data.methods.map((row) => <div key={row.method} className="rounded-lg border border-line p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">{row.method.replaceAll("_"," ")}</span><span className="text-xs text-muted2">{row.count} payment{row.count === 1 ? "" : "s"}</span></div><div className="mt-2 text-xs">{Object.entries(row.amountByCurrency).map(([currency,amount]) => <div key={currency}>{formatMoney(amount,currency)}</div>)}</div></div>) : <p className="text-sm text-muted2">No confirmed payments yet.</p>}</CardContent></Card>
    </div>
  </div>;
}

function Line({label,value,strong=false}:{label:string;value:string;strong?:boolean}) { return <div className="flex items-center justify-between gap-3"><span className="text-muted2">{label}</span><span className={strong ? "font-semibold" : "font-medium"}>{value}</span></div>; }
