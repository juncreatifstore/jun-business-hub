import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { budgetAnnualTotal, budgetPlanAnnualTotals, getBudgetAlerts, getBudgetPlan, getBudgetScenarios, getBudgetSyncHealth, getBudgetVariance } from "@/lib/finance-budgeting";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { approveBudgetPlanAction, cloneBudgetPlanAction, setBudgetPlanStatusAction, updateBudgetPlanAction } from "@/services/finance-budgeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Copy, Database, Info, LockKeyhole, Save, ShieldCheck, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";
const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];

export default async function BudgetDetailPage({ params, searchParams }: { params: { id: string }; searchParams: { success?: string; error?: string } }) {
  const user = await requirePermission("BUDGET_READ");
  const plan = await getBudgetPlan(params.id); if (!plan) notFound();
  const now = new Date();
  const throughMonth = now.getUTCFullYear() === plan.year ? now.getUTCMonth() : now.getUTCFullYear() > plan.year ? 11 : -1;
  const [variance, scenarios, alerts, sync] = await Promise.all([
    getBudgetVariance(plan, throughMonth), getBudgetScenarios(plan, now), getBudgetAlerts(plan, throughMonth), getBudgetSyncHealth(plan),
  ]);
  const annual = budgetPlanAnnualTotals(plan);
  const editable = plan.status === "DRAFT" && can(user,"BUDGET_CREATE");
  const approver = can(user,"BUDGET_APPROVE");
  const t = variance.totals;
  const remainingCostBudget = Math.max(0, t.budgetCosts - t.actualCosts);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><Link href="/app/finance/budgeting" className="text-xs font-medium text-electric">← Budget & Performance</Link><h1 className="mt-2 text-3xl font-semibold">{plan.name}</h1><p className="mt-1 text-sm text-muted2">{plan.year} · {plan.currency} · {statusFr(plan.status)} · mis à jour {formatDateTime(new Date(plan.updatedAt))}</p></div>
      <div className="flex flex-wrap gap-2"><a href={`/api/finance/budgeting/${plan.id}/export.csv`} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Exporter CSV</a>{can(user,"BUDGET_CREATE")&&<form action={cloneBudgetPlanAction.bind(null,plan.id)}><button className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><Copy className="h-4 w-4"/>Créer une révision</button></form>}</div>
    </div>

    {searchParams.success&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.success}</div>}{searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}

    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-3"><div className="mt-0.5 rounded-full bg-emerald-100 p-2 text-emerald-700"><CheckCircle2 className="h-5 w-5"/></div><div><div className="font-semibold text-emerald-900">Synchronisation Finance : à jour</div><div className="mt-1 max-w-3xl text-xs leading-relaxed text-emerald-800">{sync.explanation}</div></div></div>
        <div className="text-right text-xs text-emerald-800"><div className="font-semibold">Source : {sync.source}</div><div>{sync.lastFinanceUpdate ? `Dernière activité finance : ${formatDateTime(sync.lastFinanceUpdate)}` : "Aucune activité financière trouvée"}</div></div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3"><SyncStat label="Paiements détectés" value={sync.paymentCount}/><SyncStat label="Remboursements" value={sync.refundCount}/><SyncStat label="Dépenses" value={sync.expenseCount}/></div>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Info className="h-5 w-5 text-electric"/>Comment lire ce budget</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-4"><Explain title="Prévu" text="Montant que JUN a décidé de viser ou de ne pas dépasser."/><Explain title="Réel" text="Montant réellement reçu, remboursé ou payé dans Finance JUN."/><Explain title="Écart" text="Différence entre le réel et le prévu. Vert = favorable, rouge = défavorable."/><Explain title="Utilisation" text="Pourcentage du budget déjà consommé. 100 % signifie que l’enveloppe est utilisée."/></div></CardContent></Card>

    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="Revenus prévus à date" value={formatMoney(t.budgetRevenue,plan.currency)} hint={`Objectif cumulé jusqu’à ${throughMonth>=0?MONTHS[throughMonth]:"début"}`}/>
      <Metric label="Revenus réellement reçus" value={formatMoney(t.actualRevenue,plan.currency)} hint="Paiements confirmés Finance JUN" tone={t.actualRevenue>=t.budgetRevenue?"good":"watch"}/>
      <Metric label="Dépenses prévues à date" value={formatMoney(t.budgetCosts,plan.currency)} hint="Remboursements + dépenses opérationnelles"/>
      <Metric label="Budget dépenses restant" value={formatMoney(remainingCostBudget,plan.currency)} hint={t.actualCosts>t.budgetCosts?"Budget dépassé":"Montant encore disponible"} tone={t.actualCosts>t.budgetCosts?"bad":"good"}/>
    </div>

    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="Net prévu à date" value={formatMoney(t.budgetNet,plan.currency)} hint="Revenus prévus - coûts prévus"/>
      <Metric label="Net réel à date" value={formatMoney(t.actualNet,plan.currency)} hint="Revenus reçus - coûts réellement payés" tone={t.actualNet>=0?"good":"bad"}/>
      <Metric label="Budget annuel revenus" value={formatMoney(annual.revenue,plan.currency)} hint="Objectif sur 12 mois"/>
      <Metric label="Alertes" value={String(alerts.length)} hint={alerts.length?"Catégories qui nécessitent une attention":"Aucune alerte importante"} tone={alerts.length?"watch":"good"}/>
    </div>

    <Card><CardHeader><CardTitle>Prévu vs Réel {throughMonth>=0?`— jusqu’à ${MONTHS[throughMonth]} ${plan.year}`:`— commence en ${plan.year}`}</CardTitle></CardHeader><CardContent>
      <div className="mb-4 rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-800"><Database className="mr-1 inline h-4 w-4"/>La colonne <strong>Réel</strong> est calculée automatiquement depuis Payments, Refunds, Expenses et frais de paiement. Elle n’attend plus une saisie manuelle dans le Grand Livre.</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted2"><th className="px-2 py-2">Catégorie</th><th className="px-2 py-2 text-right">Prévu</th><th className="px-2 py-2 text-right">Réel</th><th className="px-2 py-2 text-right">Reste / écart</th><th className="px-2 py-2 text-right">Utilisation</th><th className="px-2 py-2">État</th></tr></thead><tbody>{variance.rows.map(row=>{
        const isRevenue=row.category==="REVENUE"; const remainder=isRevenue?row.actual-row.budget:row.budget-row.actual;
        return <tr key={row.category} className="border-b border-line/70"><td className="px-2 py-3"><div className="font-medium">{row.label}</div><div className="mt-0.5 text-[10px] text-muted2">{sourceLabel(row.category)}</div></td><td className="px-2 py-3 text-right">{formatMoney(row.budget,plan.currency)}</td><td className="px-2 py-3 text-right font-medium">{formatMoney(row.actual,plan.currency)}</td><td className={`px-2 py-3 text-right font-semibold ${remainder>=0?"text-emerald-700":"text-red-700"}`}>{formatMoney(remainder,plan.currency)}</td><td className="px-2 py-3 text-right">{row.utilizationPercent===null?"Sans budget":`${row.utilizationPercent}%`}</td><td className="px-2 py-3"><StatusBadge status={row.status}/></td></tr>})}</tbody></table></div>
    </CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-electric"/>Projection fin d’année</CardTitle></CardHeader><CardContent><p className="mb-3 text-xs text-muted2">Le système combine le réel déjà enregistré avec le budget des mois restants.</p><div className="space-y-2">{scenarios.map(s=><div key={s.scenario} className="grid grid-cols-4 items-center gap-2 rounded-lg border border-line px-3 py-3 text-sm"><div className="font-semibold">{scenarioFr(s.scenario)}</div><div className="text-right"><div className="text-[11px] text-muted2">Revenus</div>{formatMoney(s.revenue,plan.currency)}</div><div className="text-right"><div className="text-[11px] text-muted2">Coûts</div>{formatMoney(s.costs,plan.currency)}</div><div className={`text-right font-semibold ${s.net>=0?"text-emerald-700":"text-red-700"}`}><div className="text-[11px] text-muted2">Net</div>{formatMoney(s.net,plan.currency)}</div></div>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Alertes budget</CardTitle></CardHeader><CardContent>{alerts.length?<div className="space-y-2">{alerts.slice(0,10).map(a=><div key={a.category} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600"/><div><div className="text-sm font-medium">{a.label}</div><div className="text-xs text-muted2">{statusText(a.status)}</div></div></div><div className={a.favorableVariance>=0?"text-sm font-semibold text-emerald-700":"text-sm font-semibold text-red-700"}>{formatMoney(a.favorableVariance,plan.currency)}</div></div>)}</div>:<p className="text-sm text-muted2">Aucune alerte de variance pour cette période.</p>}</CardContent></Card>
    </div>

    <form action={updateBudgetPlanAction.bind(null,plan.id)} className="space-y-4">
      <Card><CardHeader><CardTitle>Prévisions mensuelles</CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-xl bg-surface p-3 text-xs text-muted2">Ces montants sont vos <strong>objectifs</strong>. Ils ne sont pas des transactions réelles. Les transactions réelles sont synchronisées automatiquement dans le tableau ci-dessus.</div><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Nom du budget<input name="name" defaultValue={plan.name} disabled={!editable} className="mt-1 w-full rounded-lg border border-line px-3 py-2 disabled:bg-surface"/></label><label className="text-sm">Note de planification<input name="note" defaultValue={plan.note} disabled={!editable} className="mt-1 w-full rounded-lg border border-line px-3 py-2 disabled:bg-surface"/></label></div><div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-xs"><thead><tr className="border-b border-line"><th className="sticky left-0 bg-white px-2 py-2 text-left">Catégorie</th>{MONTHS.map(m=><th key={m} className="px-2 py-2 text-right">{m}</th>)}<th className="px-2 py-2 text-right">Annuel</th></tr></thead><tbody>{plan.lines.map(line=><tr key={line.category} className="border-b border-line/70"><td className="sticky left-0 bg-white px-2 py-2 font-medium">{line.label}</td>{line.monthly.map((value,month)=><td key={month} className="px-1 py-1"><input name={`budget_${line.category}_${month}`} type="number" min="0" step="0.01" defaultValue={value} disabled={!editable} className="w-24 rounded border border-line px-2 py-1 text-right disabled:bg-surface"/></td>)}<td className="px-2 py-2 text-right font-semibold">{formatMoney(budgetAnnualTotal(line),plan.currency)}</td></tr>)}</tbody></table></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Hypothèses de projection</CardTitle></CardHeader><CardContent><p className="mb-3 text-xs text-muted2">Ces multiplicateurs servent uniquement à calculer les scénarios optimiste et prudent.</p><div className="grid gap-3 md:grid-cols-4"><Scenario label="Revenus scénario optimiste" name="bestRevenueMultiplier" value={plan.assumptions.bestRevenueMultiplier} disabled={!editable}/><Scenario label="Coûts scénario optimiste" name="bestCostMultiplier" value={plan.assumptions.bestCostMultiplier} disabled={!editable}/><Scenario label="Revenus scénario prudent" name="worstRevenueMultiplier" value={plan.assumptions.worstRevenueMultiplier} disabled={!editable}/><Scenario label="Coûts scénario prudent" name="worstCostMultiplier" value={plan.assumptions.worstCostMultiplier} disabled={!editable}/></div>{editable&&<button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"><Save className="h-4 w-4"/>Enregistrer le budget</button>}</CardContent></Card>
    </form>

    {(approver||plan.status!=="DRAFT")&&<Card><CardHeader><CardTitle>Validation & contrôle</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{approver&&plan.status==="DRAFT"&&<form action={approveBudgetPlanAction.bind(null,plan.id)}><button className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white"><ShieldCheck className="h-4 w-4"/>Approuver le budget</button></form>}{approver&&plan.status==="APPROVED"&&<form action={setBudgetPlanStatusAction.bind(null,plan.id)}><input type="hidden" name="status" value="LOCKED"/><button className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"><LockKeyhole className="h-4 w-4"/>Verrouiller</button></form>}{approver&&["DRAFT","APPROVED","LOCKED"].includes(plan.status)&&<form action={setBudgetPlanStatusAction.bind(null,plan.id)}><input type="hidden" name="status" value="ARCHIVED"/><button className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium">Archiver</button></form>}<div className="self-center text-xs text-muted2">Un budget approuvé est figé pour préserver l’historique. Pour le modifier, créez une révision.</div></CardContent></Card>}
  </div>;
}

function sourceLabel(category:string){if(category==="REVENUE")return"Source : paiements confirmés";if(category==="REFUNDS")return"Source : remboursements effectivement payés";if(category==="BANK_FEES")return"Source : frais de paiement + dépenses bancaires";return"Source : dépenses effectivement payées";}
function statusFr(status:string){return status==="DRAFT"?"Brouillon":status==="APPROVED"?"Approuvé":status==="LOCKED"?"Verrouillé":"Archivé";}
function scenarioFr(s:string){return s==="BEST"?"Optimiste":s==="WORST"?"Prudent":"Base";}
function statusText(s:string){return s==="ON_TRACK"?"Dans le budget":s==="WATCH"?"À surveiller":s==="OVER_BUDGET"?"Budget dépassé":"Objectif de revenus non atteint";}
function StatusBadge({status}:{status:string}){const style=status==="ON_TRACK"?"bg-emerald-50 text-emerald-700":status==="WATCH"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700";return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${style}`}>{statusText(status)}</span>}
function Metric({label,value,hint,tone="neutral"}:{label:string;value:string;hint:string;tone?:"neutral"|"good"|"watch"|"bad"}){const style=tone==="good"?"border-emerald-200 bg-emerald-50/40":tone==="watch"?"border-amber-200 bg-amber-50/40":tone==="bad"?"border-red-200 bg-red-50/40":"border-line bg-white";return <div className={`rounded-xl border p-4 ${style}`}><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>}
function SyncStat({label,value}:{label:string;value:number}){return <div className="rounded-lg bg-white/70 px-3 py-2 text-xs text-emerald-900"><strong>{value}</strong> {label}</div>}
function Explain({title,text}:{title:string;text:string}){return <div className="rounded-xl bg-surface p-3"><div className="text-sm font-semibold">{title}</div><div className="mt-1 text-xs leading-relaxed text-muted2">{text}</div></div>}
function Scenario({label,name,value,disabled}:{label:string;name:string;value:number;disabled:boolean}){return <label className="text-xs">{label}<input name={name} type="number" step="0.01" min="0.01" max="5" defaultValue={value} disabled={disabled} className="mt-1 w-full rounded-lg border border-line px-3 py-2 disabled:bg-surface"/></label>}
