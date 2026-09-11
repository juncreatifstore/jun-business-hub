import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  FISCAL_MONTHS,
  budgetAnnualTotal,
  budgetPlanAnnualTotals,
  getBudgetAlerts,
  getBudgetFiscalPeriod,
  getBudgetPlan,
  getBudgetProjectPerformance,
  getBudgetScenarios,
  getBudgetSyncHealth,
  getBudgetThroughMonth,
  getBudgetVariance,
} from "@/lib/finance-budgeting";
import { formatDateTime, formatMoney } from "@/lib/utils";
import {
  addBudgetProjectAction,
  approveBudgetPlanAction,
  cloneBudgetPlanAction,
  removeBudgetProjectAction,
  setBudgetPlanStatusAction,
  updateBudgetPlanAction,
  updateBudgetProjectAction,
} from "@/services/finance-budgeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarRange,
  CheckCircle2,
  Copy,
  Info,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BudgetDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await requirePermission("BUDGET_READ");
  const plan = await getBudgetPlan(params.id);
  if (!plan) notFound();
  const now = new Date();
  const throughMonth = getBudgetThroughMonth(plan, now);
  const period = getBudgetFiscalPeriod(plan.year);
  const [variance, scenarios, alerts, sync, projects, cases] = await Promise.all([
    getBudgetVariance(plan, throughMonth),
    getBudgetScenarios(plan, now),
    getBudgetAlerts(plan, throughMonth),
    getBudgetSyncHealth(plan),
    getBudgetProjectPerformance(plan),
    prisma.case.findMany({
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        status: true,
        client: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);
  const annual = budgetPlanAnnualTotals(plan);
  const editable = plan.status === "DRAFT" && can(user, "BUDGET_CREATE");
  const approver = can(user, "BUDGET_APPROVE");
  const t = variance.totals;
  const annualMargin = annual.revenue > 0 ? (annual.net / annual.revenue) * 100 : null;
  const actualMargin = t.actualRevenue > 0 ? (t.actualNet / t.actualRevenue) * 100 : null;
  const projectPlannedRevenue = projects.reduce((s, p) => s + p.plannedRevenue, 0),
    projectPlannedCosts = projects.reduce((s, p) => s + p.plannedCosts, 0),
    projectPlannedProfit = projects.reduce((s, p) => s + p.plannedProfit, 0);
  const projectActualRevenue = projects.reduce((s, p) => s + p.actualRevenue, 0),
    projectActualCosts = projects.reduce((s, p) => s + p.actualCosts, 0),
    projectActualProfit = projects.reduce((s, p) => s + p.actualProfit, 0);
  const availableCases = cases.filter((c) => !plan.projects.some((p) => p.caseId === c.id));

  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/finance/budgeting" className="text-xs font-medium text-electric">
            ← Budget & Performance
          </Link>
          <h1 className="mt-2 break-words text-2xl font-semibold sm:text-3xl">{plan.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted2">
            <span>FY{plan.year}</span>
            <span>·</span>
            <span>{plan.currency}</span>
            <span>·</span>
            <span>{statusFr(plan.status)}</span>
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <a
            href={`/api/finance/budgeting/${plan.id}/export.csv`}
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-line bg-ink/[0.03] px-3 py-2 text-xs font-medium"
          >
            Exporter CSV
          </a>
          {can(user, "BUDGET_CREATE") ? (
            <form action={cloneBudgetPlanAction.bind(null, plan.id)}>
              <button className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-ink/[0.03] px-3 py-2 text-xs font-medium">
                <Copy className="h-4 w-4" />
                Créer une révision
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {searchParams.success ? (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {searchParams.success}
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
          {searchParams.error}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.06] p-4">
          <div className="flex gap-3">
            <CalendarRange className="h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="font-semibold text-blue-100">Année budgétaire FY{plan.year}</div>
              <div className="mt-1 text-sm text-blue-100/80">
                <strong>01 septembre {plan.year - 1}</strong> → <strong>30 août {plan.year}</strong>
              </div>
              <div className="mt-1 text-xs leading-relaxed text-blue-100/60">
                Ordre mensuel : Sep, Oct, Nov, Déc, Jan, Fév, Mar, Avr, Mai, Juin, Juil, Août.
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <div className="min-w-0">
              <div className="font-semibold text-emerald-100">Synchronisation Finance automatique</div>
              <div className="mt-1 break-words text-xs leading-relaxed text-emerald-100/75">
                {sync.explanation}
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-emerald-100/60">
                {sync.paymentCount} paiements · {sync.refundCount} remboursements · {sync.expenseCount}{" "}
                dépenses
                {sync.lastFinanceUpdate
                  ? ` · dernière activité ${formatDateTime(sync.lastFinanceUpdate)}`
                  : ""}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-electric" />
            Planification du profit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Explain
              title="1. Revenus"
              text="Fixez les revenus que JUN veut atteindre chaque mois et par projet."
            />
            <Explain
              title="2. Dépenses"
              text="Définissez le plafond de dépenses opérationnelles et de chaque projet."
            />
            <Explain
              title="3. Profit"
              text="Profit = revenus - remboursements - dépenses - frais de paiement."
            />
            <Explain
              title="4. Contrôle"
              text="Le réel se met à jour automatiquement et JUN affiche les écarts et marges."
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Revenus prévus FY"
          value={formatMoney(annual.revenue, plan.currency)}
          hint="Objectif total 12 mois"
        />
        <Metric
          label="Dépenses prévues FY"
          value={formatMoney(annual.costs, plan.currency)}
          hint="Plafond total planifié"
        />
        <Metric
          label="Profit prévu FY"
          value={formatMoney(annual.net, plan.currency)}
          hint={annualMargin === null ? "Marge non calculable" : `Marge prévue ${annualMargin.toFixed(1)} %`}
          tone={annual.net >= 0 ? "good" : "bad"}
        />
        <Metric
          label="Profit réel à date"
          value={formatMoney(t.actualNet, plan.currency)}
          hint={actualMargin === null ? "Aucun revenu réel" : `Marge réelle ${actualMargin.toFixed(1)} %`}
          tone={t.actualNet >= 0 ? "good" : "bad"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-electric" />
            Projets & rentabilité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-surface p-3 text-xs leading-relaxed text-muted2">
            Chaque projet est relié à un <strong>dossier JUN</strong>. Les paiements, remboursements, dépenses
            et frais associés à ce dossier alimentent automatiquement sa rentabilité.
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Projets" value={String(projects.length)} hint="Attachés à ce budget" />
            <Metric
              label="Profit projets prévu"
              value={formatMoney(projectPlannedProfit, plan.currency)}
              hint={`${formatMoney(projectPlannedRevenue, plan.currency)} revenus · ${formatMoney(projectPlannedCosts, plan.currency)} coûts`}
              tone={projectPlannedProfit >= 0 ? "good" : "bad"}
            />
            <Metric
              label="Profit projets réel"
              value={formatMoney(projectActualProfit, plan.currency)}
              hint={`${formatMoney(projectActualRevenue, plan.currency)} revenus · ${formatMoney(projectActualCosts, plan.currency)} coûts`}
              tone={projectActualProfit >= 0 ? "good" : "bad"}
            />
          </div>

          {editable ? (
            <form
              action={addBudgetProjectAction.bind(null, plan.id)}
              className="grid gap-3 rounded-2xl border border-line bg-ink/[0.025] p-4 md:grid-cols-4"
            >
              <label className="min-w-0 text-xs md:col-span-2">
                Projet / dossier
                <select
                  name="caseId"
                  required
                  className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-night-soft px-3 py-2 text-sm"
                >
                  <option value="">Sélectionner un dossier…</option>
                  {availableCases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber} · {c.title} · {c.client.firstName} {c.client.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Revenu prévu
                <input
                  name="plannedRevenue"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className="mt-1 min-h-11 w-full rounded-xl border border-line bg-night-soft px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                Dépenses prévues
                <input
                  name="plannedCosts"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  defaultValue="0"
                  className="mt-1 min-h-11 w-full rounded-xl border border-line bg-night-soft px-3 py-2 text-sm"
                />
              </label>
              <label className="min-w-0 text-xs md:col-span-3">
                Note projet
                <input
                  name="projectNote"
                  className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-line bg-night-soft px-3 py-2 text-sm"
                  placeholder="Objectif, limites, hypothèses…"
                />
              </label>
              <div className="flex items-end">
                <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-electric px-3 py-2 text-sm font-medium text-white">
                  <Plus className="h-4 w-4" />
                  Ajouter le projet
                </button>
              </div>
            </form>
          ) : null}

          {projects.length ? (
            <>
              <div className="space-y-3 md:hidden">
                {projects.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-line bg-ink/[0.025] p-4">
                    <div className="min-w-0">
                      <Link
                        href={`/app/cases/${p.caseId}`}
                        className="block break-words font-medium text-electric"
                      >
                        {p.caseNumber} · {p.caseTitle}
                      </Link>
                      <div className="mt-1 text-[11px] leading-relaxed text-muted2">
                        Remboursements {formatMoney(p.refundPaid, plan.currency)} · dépenses{" "}
                        {formatMoney(p.expensePaid, plan.currency)} · frais{" "}
                        {formatMoney(p.fees, plan.currency)}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <MiniStat label="Revenu prévu" value={formatMoney(p.plannedRevenue, plan.currency)} />
                      <MiniStat label="Coût prévu" value={formatMoney(p.plannedCosts, plan.currency)} />
                      <MiniStat
                        label="Profit prévu"
                        value={formatMoney(p.plannedProfit, plan.currency)}
                        tone={p.plannedProfit >= 0 ? "good" : "bad"}
                      />
                      <MiniStat label="Revenu réel" value={formatMoney(p.actualRevenue, plan.currency)} />
                      <MiniStat label="Dépense réelle" value={formatMoney(p.actualCosts, plan.currency)} />
                      <MiniStat
                        label="Profit réel"
                        value={formatMoney(p.actualProfit, plan.currency)}
                        tone={p.actualProfit >= 0 ? "good" : "bad"}
                      />
                      <MiniStat label="Marge" value={p.margin === null ? "—" : `${p.margin}%`} />
                    </div>
                    {editable ? (
                      <div className="mt-4 border-t border-line pt-4">
                        <form
                          action={updateBudgetProjectAction.bind(null, plan.id, p.id)}
                          className="grid grid-cols-2 gap-2"
                        >
                          <label className="text-[11px] text-muted2">
                            Revenu prévu
                            <input
                              name="plannedRevenue"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              defaultValue={p.plannedRevenue}
                              className="mt-1 min-h-10 w-full rounded-lg border border-line bg-night-soft px-2 py-1 text-sm"
                            />
                          </label>
                          <label className="text-[11px] text-muted2">
                            Coût prévu
                            <input
                              name="plannedCosts"
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              defaultValue={p.plannedCosts}
                              className="mt-1 min-h-10 w-full rounded-lg border border-line bg-night-soft px-2 py-1 text-sm"
                            />
                          </label>
                          <input type="hidden" name="projectNote" value={p.note} />
                          <button className="col-span-2 min-h-10 rounded-lg border border-line bg-ink/[0.03] px-3 text-xs font-medium">
                            Mettre à jour
                          </button>
                        </form>
                        <form action={removeBudgetProjectAction.bind(null, plan.id, p.id)} className="mt-2">
                          <button className="min-h-10 w-full rounded-lg border border-red-400/20 bg-red-500/10 px-3 text-xs font-medium text-danger">
                            Retirer du budget
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-muted2">Budget figé</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1180px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted2">
                      <th className="px-2 py-2">Projet</th>
                      <th className="px-2 py-2 text-right">Revenu prévu</th>
                      <th className="px-2 py-2 text-right">Coût prévu</th>
                      <th className="px-2 py-2 text-right">Profit prévu</th>
                      <th className="px-2 py-2 text-right">Revenu réel</th>
                      <th className="px-2 py-2 text-right">Dépense réelle</th>
                      <th className="px-2 py-2 text-right">Profit réel</th>
                      <th className="px-2 py-2 text-right">Marge</th>
                      <th className="px-2 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id} className="border-b border-line/70 align-top">
                        <td className="px-2 py-3">
                          <Link
                            href={`/app/cases/${p.caseId}`}
                            className="font-medium text-electric hover:underline"
                          >
                            {p.caseNumber} · {p.caseTitle}
                          </Link>
                          <div className="mt-1 text-[10px] text-muted2">
                            Remboursements {formatMoney(p.refundPaid, plan.currency)} · dépenses{" "}
                            {formatMoney(p.expensePaid, plan.currency)} · frais{" "}
                            {formatMoney(p.fees, plan.currency)}
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right">
                          {formatMoney(p.plannedRevenue, plan.currency)}
                        </td>
                        <td className="px-2 py-3 text-right">{formatMoney(p.plannedCosts, plan.currency)}</td>
                        <td
                          className={`px-2 py-3 text-right font-semibold ${p.plannedProfit >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {formatMoney(p.plannedProfit, plan.currency)}
                        </td>
                        <td className="px-2 py-3 text-right">
                          {formatMoney(p.actualRevenue, plan.currency)}
                        </td>
                        <td className="px-2 py-3 text-right">{formatMoney(p.actualCosts, plan.currency)}</td>
                        <td
                          className={`px-2 py-3 text-right font-semibold ${p.actualProfit >= 0 ? "text-success" : "text-danger"}`}
                        >
                          {formatMoney(p.actualProfit, plan.currency)}
                        </td>
                        <td className="px-2 py-3 text-right">{p.margin === null ? "—" : `${p.margin}%`}</td>
                        <td className="px-2 py-3">
                          {editable ? (
                            <div className="space-y-2">
                              <form
                                action={updateBudgetProjectAction.bind(null, plan.id, p.id)}
                                className="grid grid-cols-2 gap-1"
                              >
                                <input
                                  name="plannedRevenue"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={p.plannedRevenue}
                                  className="w-24 rounded border border-line bg-night-soft px-2 py-1 text-xs"
                                />
                                <input
                                  name="plannedCosts"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  defaultValue={p.plannedCosts}
                                  className="w-24 rounded border border-line bg-night-soft px-2 py-1 text-xs"
                                />
                                <input type="hidden" name="projectNote" value={p.note} />
                                <button className="col-span-2 rounded border border-line px-2 py-1 text-xs">
                                  Mettre à jour
                                </button>
                              </form>
                              <form action={removeBudgetProjectAction.bind(null, plan.id, p.id)}>
                                <button className="text-xs font-medium text-danger">Retirer du budget</button>
                              </form>
                            </div>
                          ) : (
                            <span className="text-xs text-muted2">Figé</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted2">
              Aucun projet ajouté à ce budget.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          label="Revenus prévus à date"
          value={formatMoney(t.budgetRevenue, plan.currency)}
          hint={throughMonth >= 0 ? `Cumul jusqu’à ${FISCAL_MONTHS[throughMonth]}` : "Période non commencée"}
        />
        <Metric
          label="Revenus réels à date"
          value={formatMoney(t.actualRevenue, plan.currency)}
          hint="Paiements confirmés"
          tone={t.actualRevenue >= t.budgetRevenue ? "good" : "watch"}
        />
        <Metric
          label="Dépenses prévues à date"
          value={formatMoney(t.budgetCosts, plan.currency)}
          hint="Cumul budgété"
        />
        <Metric
          label="Dépenses réelles à date"
          value={formatMoney(t.actualCosts, plan.currency)}
          hint="Remboursements + dépenses + frais"
          tone={t.actualCosts <= t.budgetCosts ? "good" : "bad"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Prévu vs Réel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {variance.rows.map((row) => {
              const isRevenue = row.category === "REVENUE",
                remainder = isRevenue ? row.actual - row.budget : row.budget - row.actual;
              return (
                <div key={row.category} className="rounded-2xl border border-line bg-ink/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">{row.label}</div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <MiniStat label="Prévu" value={formatMoney(row.budget, plan.currency)} />
                    <MiniStat label="Réel" value={formatMoney(row.actual, plan.currency)} />
                    <MiniStat
                      label="Reste / écart"
                      value={formatMoney(remainder, plan.currency)}
                      tone={remainder >= 0 ? "good" : "bad"}
                    />
                    <MiniStat
                      label="Utilisation"
                      value={row.utilizationPercent === null ? "Sans budget" : `${row.utilizationPercent}%`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted2">
                  <th className="px-2 py-2">Catégorie</th>
                  <th className="px-2 py-2 text-right">Prévu</th>
                  <th className="px-2 py-2 text-right">Réel</th>
                  <th className="px-2 py-2 text-right">Reste / écart</th>
                  <th className="px-2 py-2 text-right">Utilisation</th>
                  <th className="px-2 py-2">État</th>
                </tr>
              </thead>
              <tbody>
                {variance.rows.map((row) => {
                  const isRevenue = row.category === "REVENUE",
                    remainder = isRevenue ? row.actual - row.budget : row.budget - row.actual;
                  return (
                    <tr key={row.category} className="border-b border-line/70">
                      <td className="px-2 py-3 font-medium">{row.label}</td>
                      <td className="px-2 py-3 text-right">{formatMoney(row.budget, plan.currency)}</td>
                      <td className="px-2 py-3 text-right font-medium">
                        {formatMoney(row.actual, plan.currency)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right font-semibold ${remainder >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {formatMoney(remainder, plan.currency)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {row.utilizationPercent === null ? "Sans budget" : `${row.utilizationPercent}%`}
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-electric" />
              Projection jusqu’au 30 août
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted2">
              Le réel déjà enregistré est combiné aux prévisions des mois restants.
            </p>
            <div className="space-y-2">
              {scenarios.map((s) => (
                <div
                  key={s.scenario}
                  className="rounded-xl border border-line p-3 text-sm sm:grid sm:grid-cols-4 sm:gap-2"
                >
                  <div className="mb-3 font-semibold sm:mb-0">{scenarioFr(s.scenario)}</div>
                  <div className="grid grid-cols-3 gap-2 sm:contents">
                    <div className="text-right">
                      <div className="text-[10px] text-muted2">Revenus</div>
                      {formatMoney(s.revenue, plan.currency)}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-muted2">Coûts</div>
                      {formatMoney(s.costs, plan.currency)}
                    </div>
                    <div
                      className={`text-right font-semibold ${s.net >= 0 ? "text-success" : "text-danger"}`}
                    >
                      <div className="text-[10px] text-muted2">Profit</div>
                      {formatMoney(s.net, plan.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Alertes</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length ? (
              <div className="space-y-2">
                {alerts.slice(0, 10).map((a) => (
                  <div
                    key={a.category}
                    className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      <div className="min-w-0">
                        <div className="break-words text-sm font-medium">{a.label}</div>
                        <div className="text-xs text-muted2">{statusText(a.status)}</div>
                      </div>
                    </div>
                    <div
                      className={`${a.favorableVariance >= 0 ? "font-semibold text-success" : "font-semibold text-danger"} sm:text-right`}
                    >
                      {formatMoney(a.favorableVariance, plan.currency)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted2">Aucune alerte importante.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <form action={updateBudgetPlanAction.bind(null, plan.id)} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-electric" />
              Plan mensuel FY{plan.year}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Nom du budget
                <input
                  name="name"
                  defaultValue={plan.name}
                  disabled={!editable}
                  className="mt-1 min-h-11 w-full rounded-xl border border-line bg-night-soft px-3 py-2 disabled:opacity-60"
                />
              </label>
              <label className="text-sm">
                Note de planification
                <input
                  name="note"
                  defaultValue={plan.note}
                  disabled={!editable}
                  className="mt-1 min-h-11 w-full rounded-xl border border-line bg-night-soft px-3 py-2 disabled:opacity-60"
                />
              </label>
            </div>
            <div className="rounded-xl border border-line bg-ink/[0.015] p-2">
              <div className="mb-2 text-[11px] text-muted2 md:hidden">
                Glissez horizontalement pour modifier les 12 mois.
              </div>
              <div className="-mx-2 overflow-x-auto px-2 [scrollbar-width:thin]">
                <table className="w-full min-w-[1320px] text-xs">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="sticky left-0 z-10 bg-night-soft px-2 py-2 text-left">Catégorie</th>
                      {FISCAL_MONTHS.map((m) => (
                        <th key={m} className="px-2 py-2 text-right">
                          {m}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right">FY total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.lines.map((line) => (
                      <tr key={line.category} className="border-b border-line/70">
                        <td className="sticky left-0 z-10 bg-night-soft px-2 py-2 font-medium">
                          {line.label}
                        </td>
                        {line.monthly.map((value, month) => (
                          <td key={month} className="px-1 py-1">
                            <input
                              name={`budget_${line.category}_${month}`}
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              defaultValue={value}
                              disabled={!editable}
                              className="w-20 rounded border border-line bg-night-soft px-2 py-1 text-right disabled:opacity-60"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-right font-semibold">
                          {formatMoney(budgetAnnualTotal(line), plan.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {editable ? (
              <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-electric px-4 py-2 text-sm font-medium text-white sm:w-auto">
                <Save className="h-4 w-4" />
                Enregistrer le plan
              </button>
            ) : null}
          </CardContent>
        </Card>
      </form>

      {approver || plan.status !== "DRAFT" ? (
        <Card>
          <CardHeader>
            <CardTitle>Validation & contrôle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:flex sm:flex-wrap">
            {approver && plan.status === "DRAFT" ? (
              <form action={approveBudgetPlanAction.bind(null, plan.id)}>
                <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-ink sm:w-auto">
                  <ShieldCheck className="h-4 w-4" />
                  Approuver
                </button>
              </form>
            ) : null}
            {approver && plan.status === "APPROVED" ? (
              <form action={setBudgetPlanStatusAction.bind(null, plan.id)}>
                <input type="hidden" name="status" value="LOCKED" />
                <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink/[0.08] px-4 py-2 text-sm font-medium sm:w-auto">
                  <LockKeyhole className="h-4 w-4" />
                  Verrouiller
                </button>
              </form>
            ) : null}
            {approver && ["DRAFT", "APPROVED", "LOCKED"].includes(plan.status) ? (
              <form action={setBudgetPlanStatusAction.bind(null, plan.id)}>
                <input type="hidden" name="status" value="ARCHIVED" />
                <button className="min-h-11 w-full rounded-xl border border-line px-4 py-2 text-sm font-medium sm:w-auto">
                  Archiver
                </button>
              </form>
            ) : null}
            <div className="text-xs leading-relaxed text-muted2 sm:self-center">
              Un budget approuvé est figé. Utilisez une révision pour modifier les objectifs.
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "watch" | "bad";
}) {
  const s =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-500/[0.06]"
      : tone === "watch"
        ? "border-amber-400/20 bg-amber-500/[0.06]"
        : tone === "bad"
          ? "border-red-400/20 bg-red-500/[0.06]"
          : "border-line bg-ink/[0.025]";
  return (
    <div className={`min-w-0 rounded-xl border p-3 sm:p-4 ${s}`}>
      <div className="text-[11px] text-muted2 sm:text-xs">{label}</div>
      <div className="mt-1 break-words text-base font-semibold sm:text-xl">{value}</div>
      <div className="mt-1 break-words text-[10px] leading-relaxed text-muted2 sm:text-xs">{hint}</div>
    </div>
  );
}
function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted2">{label}</div>
      <div
        className={`mt-1 break-words text-sm font-semibold ${tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
function Explain({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="text-xs font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted2">{text}</div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const s =
    status === "ON_TRACK"
      ? "bg-emerald-500/10 text-success"
      : status === "WATCH"
        ? "bg-amber-500/10 text-warning"
        : "bg-red-500/10 text-danger";
  return (
    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${s}`}>
      {statusText(status)}
    </span>
  );
}
function statusText(status: string) {
  return status === "ON_TRACK"
    ? "Dans le budget"
    : status === "WATCH"
      ? "À surveiller"
      : status === "OVER_BUDGET"
        ? "Budget dépassé"
        : "Objectif revenus non atteint";
}
function statusFr(status: string) {
  return status === "DRAFT"
    ? "Brouillon"
    : status === "APPROVED"
      ? "Approuvé"
      : status === "LOCKED"
        ? "Verrouillé"
        : "Archivé";
}
function scenarioFr(s: string) {
  return s === "BEST" ? "Optimiste" : s === "WORST" ? "Prudent" : "Base";
}
