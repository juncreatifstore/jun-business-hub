import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { budgetPlanAnnualTotals, listBudgetPlans } from "@/lib/finance-budgeting";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, CircleDollarSign, Plus, Target } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BudgetingPage() {
  const user = await requirePermission("BUDGET_READ");
  const plans = await listBudgetPlans();
  const active = plans.filter((p) => ["APPROVED", "LOCKED"].includes(p.status));
  const currentYear = new Date().getFullYear();
  const current = active.filter((p) => p.year === currentYear);
  const currencies = new Set(plans.map((p) => p.currency));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Financial planning</p><h1 className="mt-1 text-3xl font-semibold">Budgeting & Variance</h1><p className="mt-1 text-sm text-muted2">Annual plans with monthly allocations, actuals from the General Ledger and controlled scenario forecasting.</p></div>{can(user,"BUDGET_CREATE")&&<Link href="/app/finance/budgeting/new" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white"><Plus className="h-4 w-4"/>New budget</Link>}</div>
    <div className="grid gap-3 md:grid-cols-4"><Metric icon={Target} label="Budget plans" value={String(plans.length)} hint={`${active.length} approved / locked`}/><Metric icon={CalendarRange} label={`${currentYear} active`} value={String(current.length)} hint="Separate by currency"/><Metric icon={CircleDollarSign} label="Currencies" value={String(currencies.size)} hint="Never combined"/><Metric icon={Target} label="Draft revisions" value={String(plans.filter(p=>p.status==="DRAFT").length)} hint="Awaiting approval"/></div>
    <Card><CardHeader><CardTitle>Budget plans</CardTitle></CardHeader><CardContent>{plans.length?<div className="divide-y divide-line rounded-lg border border-line">{plans.map((plan)=>{const totals=budgetPlanAnnualTotals(plan);return <Link key={plan.id} href={`/app/finance/budgeting/${plan.id}`} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 hover:bg-surface"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{plan.name}</span><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold">{plan.status}</span></div><div className="mt-1 text-xs text-muted2">{plan.year} · {plan.currency} · updated {formatDateTime(new Date(plan.updatedAt))}</div></div><div className="grid grid-cols-3 gap-4 text-right text-xs"><div><div className="text-muted2">Revenue</div><div className="font-medium">{formatMoney(totals.revenue,plan.currency)}</div></div><div><div className="text-muted2">Costs</div><div className="font-medium">{formatMoney(totals.costs,plan.currency)}</div></div><div><div className="text-muted2">Budget net</div><div className={totals.net>=0?"font-semibold text-emerald-700":"font-semibold text-red-700"}>{formatMoney(totals.net,plan.currency)}</div></div></div></Link>})}</div>:<p className="text-sm text-muted2">No budget plan yet.</p>}</CardContent></Card>
    <p className="text-[11px] text-muted2">Approved budgets are frozen for variance reporting. Use a cloned revision instead of modifying historical targets.</p>
  </div>;
}
function Metric({icon:Icon,label,value,hint}:{icon:typeof Target;label:string;value:string;hint:string}){return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>}
