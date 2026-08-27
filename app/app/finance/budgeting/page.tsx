import Link from "next/link";
import { can, requirePermission } from "@/lib/auth";
import { budgetPlanAnnualTotals, listBudgetPlans } from "@/lib/finance-budgeting";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarRange, CircleDollarSign, Database, Info, Plus, Target } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BudgetingPage() {
  const user = await requirePermission("BUDGET_READ");
  const plans = await listBudgetPlans();
  const active = plans.filter((p) => ["APPROVED", "LOCKED"].includes(p.status));
  const currentYear = new Date().getFullYear();
  const current = active.filter((p) => p.year === currentYear);
  const currencies = new Set(plans.map((p) => p.currency));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Finance · planification</p><h1 className="mt-1 text-3xl font-semibold">Budget & Performance</h1><p className="mt-1 max-w-3xl text-sm text-muted2">Planifiez ce que JUN prévoit recevoir et dépenser, puis comparez automatiquement ces objectifs aux transactions réellement enregistrées dans Finance.</p></div>{can(user,"BUDGET_CREATE")&&<Link href="/app/finance/budgeting/new" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white"><Plus className="h-4 w-4"/>Nouveau budget</Link>}</div>

    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"><div className="flex gap-3"><Database className="mt-0.5 h-5 w-5 text-emerald-700"/><div><div className="font-semibold text-emerald-900">Synchronisation automatique avec Finance JUN</div><p className="mt-1 text-xs leading-relaxed text-emerald-800">Les montants “Réels” des budgets utilisent directement les paiements confirmés, remboursements payés, dépenses payées et frais de paiement. Une écriture manuelle dans le Grand Livre n’est plus nécessaire pour que Budget se mette à jour.</p></div></div></div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Info className="h-5 w-5 text-electric"/>À quoi sert ce module ?</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-3"><Explain title="1. Définir un objectif" text="Exemple : prévoir 20 000 USD de revenus et 5 000 USD de dépenses en septembre."/><Explain title="2. Suivre le réel" text="JUN récupère automatiquement les transactions de Finance et calcule ce qui a réellement été reçu ou payé."/><Explain title="3. Corriger avant le dépassement" text="Les écarts, pourcentages d’utilisation et alertes montrent rapidement où le budget doit être ajusté."/></div></CardContent></Card>

    <div className="grid gap-3 md:grid-cols-4"><Metric icon={Target} label="Plans de budget" value={String(plans.length)} hint={`${active.length} approuvé(s) / verrouillé(s)`}/><Metric icon={CalendarRange} label={`${currentYear} actif`} value={String(current.length)} hint="Un plan par devise si nécessaire"/><Metric icon={CircleDollarSign} label="Devises" value={String(currencies.size)} hint="Les devises ne sont jamais mélangées"/><Metric icon={Target} label="Brouillons" value={String(plans.filter(p=>p.status==="DRAFT").length)} hint="Encore modifiables"/></div>

    <Card><CardHeader><CardTitle>Plans de budget</CardTitle></CardHeader><CardContent>{plans.length?<div className="divide-y divide-line rounded-lg border border-line">{plans.map((plan)=>{const totals=budgetPlanAnnualTotals(plan);return <Link key={plan.id} href={`/app/finance/budgeting/${plan.id}`} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 hover:bg-surface"><div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{plan.name}</span><span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold">{statusFr(plan.status)}</span></div><div className="mt-1 text-xs text-muted2">{plan.year} · {plan.currency} · mis à jour {formatDateTime(new Date(plan.updatedAt))}</div></div><div className="grid grid-cols-3 gap-4 text-right text-xs"><div><div className="text-muted2">Revenus prévus</div><div className="font-medium">{formatMoney(totals.revenue,plan.currency)}</div></div><div><div className="text-muted2">Coûts prévus</div><div className="font-medium">{formatMoney(totals.costs,plan.currency)}</div></div><div><div className="text-muted2">Net prévu</div><div className={totals.net>=0?"font-semibold text-emerald-700":"font-semibold text-red-700"}>{formatMoney(totals.net,plan.currency)}</div></div></div></Link>})}</div>:<p className="text-sm text-muted2">Aucun plan de budget pour le moment.</p>}</CardContent></Card>

    <p className="text-[11px] text-muted2">Un budget approuvé est figé pour préserver l’historique des objectifs. Pour changer les objectifs, créez une révision en brouillon.</p>
  </div>;
}
function statusFr(status:string){return status==="DRAFT"?"Brouillon":status==="APPROVED"?"Approuvé":status==="LOCKED"?"Verrouillé":"Archivé";}
function Metric({icon:Icon,label,value,hint}:{icon:typeof Target;label:string;value:string;hint:string}){return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-3 h-5 w-5 text-electric"/><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>}
function Explain({title,text}:{title:string;text:string}){return <div className="rounded-xl bg-surface p-3"><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-relaxed text-muted2">{text}</div></div>}
