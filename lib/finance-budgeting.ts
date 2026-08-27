import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { expensePaidTotal, listFinanceExpenses } from "@/lib/finance-expenses";

export const BUDGET_PREFIX = "finance.budget.plan.";

export type BudgetPlanStatus = "DRAFT" | "APPROVED" | "LOCKED" | "ARCHIVED";
export type BudgetCategory =
  | "REVENUE" | "REFUNDS"
  | "AIRFARE" | "HOTEL" | "VISA_FEES" | "MARKETING" | "SOFTWARE" | "OFFICE"
  | "PAYROLL" | "PROFESSIONAL_SERVICES" | "BANK_FEES" | "TAXES" | "TRANSPORT"
  | "UTILITIES" | "OTHER_OPERATING";

export type BudgetLine = { category: BudgetCategory; label: string; monthly: number[] };
export type BudgetScenarioAssumptions = { bestRevenueMultiplier: number; bestCostMultiplier: number; worstRevenueMultiplier: number; worstCostMultiplier: number };
export type FinanceBudgetPlan = {
  id: string; name: string; year: number; currency: string; status: BudgetPlanStatus; lines: BudgetLine[];
  assumptions: BudgetScenarioAssumptions; note: string; createdById: string; approvedById: string | null;
  approvedAt: string | null; createdAt: string; updatedAt: string;
};
export type BudgetVarianceRow = {
  category: BudgetCategory; label: string; budget: number; actual: number; rawVariance: number; favorableVariance: number;
  utilizationPercent: number | null; status: "ON_TRACK" | "WATCH" | "OVER_BUDGET" | "UNDER_TARGET";
};

export const BUDGET_CATEGORIES: Array<{ category: BudgetCategory; label: string; accountCode: string; kind: "REVENUE" | "COST" }> = [
  { category: "REVENUE", label: "Revenus de services", accountCode: "4000", kind: "REVENUE" },
  { category: "REFUNDS", label: "Remboursements clients", accountCode: "4090", kind: "COST" },
  { category: "AIRFARE", label: "Billets d’avion", accountCode: "5100", kind: "COST" },
  { category: "HOTEL", label: "Hôtels", accountCode: "5110", kind: "COST" },
  { category: "VISA_FEES", label: "Frais de visa", accountCode: "5120", kind: "COST" },
  { category: "MARKETING", label: "Marketing", accountCode: "5200", kind: "COST" },
  { category: "SOFTWARE", label: "Logiciels", accountCode: "5210", kind: "COST" },
  { category: "OFFICE", label: "Bureau", accountCode: "5220", kind: "COST" },
  { category: "PAYROLL", label: "Salaires", accountCode: "5230", kind: "COST" },
  { category: "PROFESSIONAL_SERVICES", label: "Services professionnels", accountCode: "5240", kind: "COST" },
  { category: "BANK_FEES", label: "Frais bancaires / paiement", accountCode: "5250", kind: "COST" },
  { category: "TAXES", label: "Taxes", accountCode: "5260", kind: "COST" },
  { category: "TRANSPORT", label: "Transport", accountCode: "5270", kind: "COST" },
  { category: "UTILITIES", label: "Services / utilités", accountCode: "5280", kind: "COST" },
  { category: "OTHER_OPERATING", label: "Autres dépenses", accountCode: "5290", kind: "COST" },
];

const DEFAULT_ASSUMPTIONS: BudgetScenarioAssumptions = { bestRevenueMultiplier: 1.1, bestCostMultiplier: 0.95, worstRevenueMultiplier: 0.85, worstCostMultiplier: 1.15 };
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function planKey(id: string) { return `${BUDGET_PREFIX}${id}`; }
function safeMonthly(value: unknown): number[] { const input = Array.isArray(value) ? value : []; return Array.from({ length: 12 }, (_, i) => Math.max(0, round(Number(input[i] || 0)))); }
function parsePlan(value: string): FinanceBudgetPlan | null {
  try {
    const p = JSON.parse(value) as FinanceBudgetPlan;
    if (!p?.id || !p.name || !Number.isInteger(p.year)) return null;
    return { ...p, currency: String(p.currency || "USD").toUpperCase(), lines: BUDGET_CATEGORIES.map((def) => { const found = Array.isArray(p.lines) ? p.lines.find((line) => line.category === def.category) : undefined; return { category: def.category, label: def.label, monthly: safeMonthly(found?.monthly) }; }), assumptions: { ...DEFAULT_ASSUMPTIONS, ...(p.assumptions || {}) }, note: String(p.note || "") };
  } catch { return null; }
}

export function makeEmptyBudgetPlan(input: { name: string; year: number; currency: string; createdById: string }): FinanceBudgetPlan {
  const now = new Date().toISOString();
  return { id: randomUUID(), name: input.name.trim(), year: input.year, currency: input.currency.toUpperCase(), status: "DRAFT", lines: BUDGET_CATEGORIES.map((def) => ({ category: def.category, label: def.label, monthly: Array(12).fill(0) })), assumptions: { ...DEFAULT_ASSUMPTIONS }, note: "", createdById: input.createdById, approvedById: null, approvedAt: null, createdAt: now, updatedAt: now };
}
export async function listBudgetPlans(limit = 200) { const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: BUDGET_PREFIX } }, orderBy: { updatedAt: "desc" }, take: limit, select: { value: true } }); const plans: FinanceBudgetPlan[] = []; for (const row of rows) { const plan = parsePlan(row.value); if (plan) plans.push(plan); } return plans; }
export async function getBudgetPlan(id: string) { const row = await prisma.appSetting.findUnique({ where: { key: planKey(id) }, select: { value: true } }); return row ? parsePlan(row.value) : null; }
export async function saveBudgetPlan(plan: FinanceBudgetPlan) { const normalized = { ...plan, currency: plan.currency.toUpperCase(), updatedAt: new Date().toISOString() }; await prisma.appSetting.upsert({ where: { key: planKey(plan.id) }, create: { key: planKey(plan.id), value: JSON.stringify(normalized) }, update: { value: JSON.stringify(normalized) } }); return normalized; }
export function budgetAnnualTotal(line: BudgetLine) { return round(line.monthly.reduce((sum, value) => sum + value, 0)); }
export function budgetPlanAnnualTotals(plan: FinanceBudgetPlan) { const revenue = budgetAnnualTotal(plan.lines.find((line) => line.category === "REVENUE") || { category: "REVENUE", label: "Revenue", monthly: [] }); const costs = round(plan.lines.filter((line) => line.category !== "REVENUE").reduce((sum, line) => sum + budgetAnnualTotal(line), 0)); return { revenue, costs, net: round(revenue - costs) }; }

function emptyActualMap() {
  return new Map<BudgetCategory, number[]>(BUDGET_CATEGORIES.map((d) => [d.category, Array(12).fill(0)]));
}
function addActual(map: Map<BudgetCategory, number[]>, category: BudgetCategory, date: Date, amount: number, plan: FinanceBudgetPlan) {
  if (!Number.isFinite(amount) || amount <= 0 || date.getUTCFullYear() !== plan.year) return;
  const monthly = map.get(category)!;
  const month = date.getUTCMonth();
  monthly[month] = round(monthly[month] + amount);
}
function expenseBudgetCategory(category: string): BudgetCategory | null {
  if (category === "OTHER") return "OTHER_OPERATING";
  if (category === "REFUNDS_COST") return null; // refunds are sourced from the Refund module to avoid double counting
  return BUDGET_CATEGORIES.some((d) => d.category === category) ? category as BudgetCategory : "OTHER_OPERATING";
}

/**
 * Actuals are sourced directly from JUN Finance modules so Budget stays synchronized even
 * when a General Ledger posting is delayed. Revenue = confirmed gross payments; refunds =
 * PAID refund installments; operating costs = paid expense installments; payment fees are
 * added from payment core metadata.
 */
export async function getBudgetActuals(plan: FinanceBudgetPlan) {
  const [payments, refunds, expenses] = await Promise.all([
    prisma.payment.findMany({
      where: { currency: plan.currency, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      select: { id: true, amount: true, paidAt: true, createdAt: true },
    }),
    prisma.refund.findMany({
      where: { currency: plan.currency },
      include: { installments: { select: { amount: true, status: true, paidAt: true } } },
    }),
    listFinanceExpenses(5000),
  ]);
  const metaMap = await getPaymentCoreMetaMap(payments.map((p) => p.id));
  const map = emptyActualMap();

  for (const p of payments) {
    const date = new Date(p.paidAt || p.createdAt);
    addActual(map, "REVENUE", date, Number(p.amount), plan);
    const fee = Number(metaMap.get(p.id)?.feeAmount || 0);
    if (fee > 0) addActual(map, "BANK_FEES", date, fee, plan);
  }

  for (const refund of refunds) {
    for (const installment of refund.installments) {
      if (installment.status !== "PAID" || !installment.paidAt) continue;
      addActual(map, "REFUNDS", new Date(installment.paidAt), Number(installment.amount), plan);
    }
  }

  for (const expense of expenses) {
    if (expense.currency !== plan.currency || ["REJECTED", "CANCELLED"].includes(expense.status)) continue;
    const category = expenseBudgetCategory(expense.category);
    if (!category) continue;
    for (const payment of expense.payments) addActual(map, category, new Date(payment.paidAt), Number(payment.amount), plan);
    // Legacy safety: a PAID expense without payment details still contributes once using updatedAt.
    if (expense.status === "PAID" && expense.payments.length === 0 && expensePaidTotal(expense) === 0) {
      addActual(map, category, new Date(expense.updatedAt), Number(expense.amount), plan);
    }
  }

  return BUDGET_CATEGORIES.map((def) => ({ category: def.category, label: def.label, monthly: map.get(def.category)! }));
}

export async function getBudgetSyncHealth(plan: FinanceBudgetPlan) {
  const [paymentCount, refundCount, expenses, latestPayment, latestRefund] = await Promise.all([
    prisma.payment.count({ where: { currency: plan.currency, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] } } }),
    prisma.refund.count({ where: { currency: plan.currency } }),
    listFinanceExpenses(5000),
    prisma.payment.findFirst({ where: { currency: plan.currency }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.refund.findFirst({ where: { currency: plan.currency }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const relevantExpenses = expenses.filter((e) => e.currency === plan.currency);
  const expenseUpdated = relevantExpenses.map((e) => new Date(e.updatedAt).getTime());
  const latestTs = Math.max(latestPayment?.updatedAt.getTime() || 0, latestRefund?.updatedAt.getTime() || 0, ...expenseUpdated, 0);
  return {
    ok: true,
    source: "Finance JUN en temps réel",
    paymentCount,
    refundCount,
    expenseCount: relevantExpenses.length,
    lastFinanceUpdate: latestTs ? new Date(latestTs) : null,
    explanation: "Réel = paiements confirmés + remboursements payés + dépenses payées + frais de paiement. Aucun total n’est dépendant d’une écriture comptable manuelle.",
  };
}

export async function getBudgetVariance(plan: FinanceBudgetPlan, throughMonth = 11) {
  const actuals = await getBudgetActuals(plan); const hasStarted = throughMonth >= 0; const month = Math.min(11, Math.max(0, throughMonth));
  const rows: BudgetVarianceRow[] = BUDGET_CATEGORIES.map((def) => {
    const budgetLine = plan.lines.find((line) => line.category === def.category)!; const actualLine = actuals.find((line) => line.category === def.category)!;
    const budget = hasStarted ? round(budgetLine.monthly.slice(0, month + 1).reduce((s, v) => s + v, 0)) : 0;
    const actual = hasStarted ? round(actualLine.monthly.slice(0, month + 1).reduce((s, v) => s + v, 0)) : 0;
    const rawVariance = round(actual - budget); const favorableVariance = def.kind === "REVENUE" ? rawVariance : round(-rawVariance);
    const utilizationPercent = budget > 0 ? round((actual / budget) * 100) : actual > 0 ? null : 0; let status: BudgetVarianceRow["status"] = "ON_TRACK";
    if (hasStarted && def.kind === "REVENUE") { if (budget > 0 && actual < budget * 0.9) status = "UNDER_TARGET"; else if (budget > 0 && actual < budget) status = "WATCH"; }
    else if (hasStarted) { if ((budget === 0 && actual > 0) || (budget > 0 && actual > budget)) status = "OVER_BUDGET"; else if (budget > 0 && actual >= budget * 0.9) status = "WATCH"; }
    return { category: def.category, label: def.label, budget, actual, rawVariance, favorableVariance, utilizationPercent, status };
  });
  const totals = { budgetRevenue: rows.find((row) => row.category === "REVENUE")?.budget || 0, actualRevenue: rows.find((row) => row.category === "REVENUE")?.actual || 0, budgetCosts: round(rows.filter((row) => row.category !== "REVENUE").reduce((s, row) => s + row.budget, 0)), actualCosts: round(rows.filter((row) => row.category !== "REVENUE").reduce((s, row) => s + row.actual, 0)) };
  return { rows, totals: { ...totals, budgetNet: round(totals.budgetRevenue - totals.budgetCosts), actualNet: round(totals.actualRevenue - totals.actualCosts) } };
}

export async function getBudgetScenarios(plan: FinanceBudgetPlan, asOf = new Date()) {
  const actuals = await getBudgetActuals(plan); const currentMonth = asOf.getUTCFullYear() === plan.year ? asOf.getUTCMonth() : asOf.getUTCFullYear() > plan.year ? 11 : -1;
  const scenarios = [{ name: "BEST" as const, revenueMultiplier: plan.assumptions.bestRevenueMultiplier, costMultiplier: plan.assumptions.bestCostMultiplier }, { name: "BASE" as const, revenueMultiplier: 1, costMultiplier: 1 }, { name: "WORST" as const, revenueMultiplier: plan.assumptions.worstRevenueMultiplier, costMultiplier: plan.assumptions.worstCostMultiplier }];
  return scenarios.map((scenario) => {
    let revenue = 0, costs = 0;
    for (const def of BUDGET_CATEGORIES) { const budgetLine = plan.lines.find((line) => line.category === def.category)!; const actualLine = actuals.find((line) => line.category === def.category)!; const realized = currentMonth >= 0 ? actualLine.monthly.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0) : 0; const futureBudget = currentMonth < 11 ? budgetLine.monthly.slice(currentMonth + 1).reduce((s, v) => s + v, 0) : 0; const projected = round(realized + futureBudget * (def.kind === "REVENUE" ? scenario.revenueMultiplier : scenario.costMultiplier)); if (def.kind === "REVENUE") revenue += projected; else costs += projected; }
    return { scenario: scenario.name, revenue: round(revenue), costs: round(costs), net: round(revenue - costs) };
  });
}
export async function getBudgetAlerts(plan: FinanceBudgetPlan, throughMonth: number) { if (throughMonth < 0) return []; const variance = await getBudgetVariance(plan, throughMonth); return variance.rows.filter((row) => row.status !== "ON_TRACK").sort((a, b) => { const rank = { OVER_BUDGET: 3, UNDER_TARGET: 3, WATCH: 2, ON_TRACK: 1 }; return rank[b.status] - rank[a.status] || Math.abs(b.rawVariance) - Math.abs(a.rawVariance); }); }
