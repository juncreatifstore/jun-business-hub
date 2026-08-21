import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { getFinanceEnterpriseIntelligence, deterministicExecutiveSummary } from "@/lib/finance-enterprise-ai";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FinanceAIAssistant } from "@/components/app/finance-ai-assistant";
import { AlertTriangle, Bot, BrainCircuit, CircleDollarSign, Gauge, Link2, ShieldAlert, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinanceIntelligencePage() {
  const user = await requirePermission("PAYMENT_READ");
  const data = await getFinanceEnterpriseIntelligence();
  const summary = deterministicExecutiveSummary(data);
  const aiAllowed = can(user, "AI_USE");
  const riskClass = data.riskLevel === "CRITICAL" ? "text-red-700" : data.riskLevel === "HIGH" ? "text-orange-700" : data.riskLevel === "MEDIUM" ? "text-amber-700" : "text-emerald-700";

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Enterprise finance</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold"><BrainCircuit className="h-7 w-7 text-electric" />Finance Intelligence</h1><p className="mt-1 text-sm text-muted2">Explainable controls, reconciliation, anomaly detection, forecasting and read-only AI analysis.</p></div>
      <Link href="/app/finance" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium hover:bg-surface">Back to Control Center</Link>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Metric icon={Gauge} label="Risk score" value={`${data.riskScore}/100`} hint={data.riskLevel} valueClass={riskClass} />
      <Metric icon={ShieldAlert} label="Reconciliation" value={String(data.reconciliationCount)} hint="Ledger/provider mismatches" />
      <Metric icon={Link2} label="Possible duplicates" value={String(data.duplicateCount)} hint="Same client/amount in 15 min" />
      <Metric icon={AlertTriangle} label="Overdue refunds" value={String(data.overdueRefundCount)} hint="Late installments" />
      <Metric icon={CircleDollarSign} label="Active accounts" value={`${data.activeAccounts}/${data.configuredAccounts}`} hint="Configured finance rails" />
    </div>

    <Card><CardHeader><CardTitle>Executive summary</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-ink">{summary}</p><p className="mt-3 text-xs text-muted2">Generated from deterministic finance controls. Forecasts are directional projections, not guarantees.</p></CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Priority anomalies</CardTitle></CardHeader><CardContent className="p-0">{data.anomalies.length ? <div className="divide-y divide-line">{data.anomalies.slice(0, 12).map((a) => <Link key={a.id} href={a.href} className="block px-5 py-3 hover:bg-surface"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{a.title}</p><p className="mt-1 text-xs leading-5 text-muted2">{a.detail}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${a.level === "CRITICAL" ? "border-red-200 bg-red-50 text-red-700" : a.level === "HIGH" ? "border-orange-200 bg-orange-50 text-orange-700" : a.level === "MEDIUM" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{a.level}</span></div></Link>)}</div> : <p className="p-5 text-sm text-muted2">No enterprise anomalies detected in the current analysis window.</p>}</CardContent></Card>

      <Card><CardHeader><CardTitle>Cash projection by currency</CardTitle></CardHeader><CardContent className="p-0">{data.forecast.length ? <div className="divide-y divide-line">{data.forecast.map((f) => <div key={f.currency} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><div className="font-semibold">{f.currency}</div><TrendingUp className="h-4 w-4 text-electric" /></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Small label="Daily net avg" value={formatMoney(f.trailing90DailyNet, f.currency)} /><Small label="Refunds next 30d" value={formatMoney(f.scheduledRefunds30d, f.currency)} /><Small label="Projected 30d" value={formatMoney(f.projected30dNet, f.currency)} /><Small label="Projected 90d" value={formatMoney(f.projected90dNet, f.currency)} /></div></div>)}</div> : <p className="p-5 text-sm text-muted2">Not enough realized finance activity for a forecast yet.</p>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Provider & account cost analysis</CardTitle></CardHeader><CardContent className="p-0">{data.providerAnalytics.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-line bg-surface text-xs text-muted2"><tr><th className="px-5 py-3">Account / method</th><th className="px-5 py-3">Currency</th><th className="px-5 py-3">Volume</th><th className="px-5 py-3">Fees</th><th className="px-5 py-3">Fee rate</th><th className="px-5 py-3">Payments</th></tr></thead><tbody>{data.providerAnalytics.slice(0, 20).map((row, index) => <tr key={`${row.label}-${row.currency}-${index}`} className="border-b border-line last:border-0"><td className="px-5 py-3"><div className="font-medium">{row.label}</div><div className="text-xs text-muted2">{row.method.replaceAll("_", " ")}</div></td><td className="px-5 py-3">{row.currency}</td><td className="px-5 py-3">{formatMoney(row.volume, row.currency)}</td><td className="px-5 py-3">{formatMoney(row.fees, row.currency)}</td><td className="px-5 py-3">{row.feeRate.toFixed(2)}%</td><td className="px-5 py-3">{row.count}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted2">No settled payments available for fee analysis.</p>}</CardContent></Card>

    {aiAllowed ? <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><Bot className="h-4 w-4" />Finance AI</span></CardTitle></CardHeader><CardContent><FinanceAIAssistant /></CardContent></Card> : <Card><CardContent className="p-5 text-sm text-muted2">Your role can view Finance Intelligence but does not have the AI_USE permission required for the Finance Assistant.</CardContent></Card>}

    <p className="text-[11px] text-muted2">Analysis generated {formatDate(data.generatedAt)}. Enterprise intelligence is advisory and never replaces provider confirmation, accounting review or authorized human approval.</p>
  </div>;
}

function Metric({ icon: Icon, label, value, hint, valueClass = "" }: { icon: typeof Gauge; label: string; value: string; hint: string; valueClass?: string }) { return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>; }
function Small({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-surface p-2"><div className="text-[10px] uppercase tracking-wide text-muted2">{label}</div><div className="mt-1 font-medium">{value}</div></div>; }
