import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { listJournalEntries } from "@/lib/finance-accounting";

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
  { category: "REVENUE", label: "Service Revenue", accountCode: "4000", kind: "REVENUE" },
  { category: "REFUNDS", label: "Refunds & Sales Returns", accountCode: "4090", kind: "COST" },
  { category: "AIRFARE", label: "Airfare Expense", accountCode: "5100", kind: "COST" },
  { category: "HOTEL", label: "Hotel Expense", accountCode: "5110", kind: "COST" },
  { category: "VISA_FEES", label: "Visa Fees Expense", accountCode: "5120", kind: "COST" },
  { category: "MARKETING", label: "Marketing Expense", accountCode: "5200", kind: "COST" },
  { category: "SOFTWARE", label: "Software Expense", accountCode: "5210", kind: "COST" },
  { category: "OFFICE", label: "Office Expense", accountCode: "5220", kind: "COST" },
  { category: "PAYROLL", label: "Payroll Expense", accountCode: "5230", kind: "COST" },
  { category: "PROFESSIONAL_SERVICES", label: "Professional Services", accountCode: "5240", kind: "COST" },
  { category: "BANK_FEES", label: "Payment & Bank Fees", accountCode: "5250", kind: "COST" },
  { category: "TAXES", label: "Taxes Expense", accountCode: "5260", kind: "COST" },
  { category: "TRANSPORT", label: "Transport Expense", accountCode: "5270", kind: "COST" },
  { category: "UTILITIES", label: "Utilities Expense", accountCode: "5280", kind: "COST" },
  { category: "OTHER_OPERATING", label: "Other Operating Expense", accountCode: "5290", kind: "COST" },
];

const DEFAULT_ASSUMPTIONS: BudgetScenarioAssumptions = { bestRevenueMultiplier: 1.1, bestCostMultiplier: 0.95, worstRevenueMultiplier: 0.85, worstCostMultiplier: 1.15 };
function round(value: number) { return Math.round(value * 100) / 100; }
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

export async function getBudgetActuals(plan: FinanceBudgetPlan) {
  const entries = (await listJournalEntries(10000)).filter((entry) => entry.currency === plan.currency && new Date(entry.date).getUTCFullYear() === plan.year);
  const byAccount = new Map<string, number[]>();
  for (const entry of entries) for (const line of entry.lines) {
    const def = BUDGET_CATEGORIES.find((item) => item.accountCode === line.accountCode); if (!def) continue;
    const month = new Date(entry.date).getUTCMonth(); const monthly = byAccount.get(line.accountCode) || Array(12).fill(0);
    const amount = def.kind === "REVENUE" ? line.credit - line.debit : line.debit - line.credit;
    monthly[month] = round(monthly[month] + amount); byAccount.set(line.accountCode, monthly);
  }
  return BUDGET_CATEGORIES.map((def) => ({ category: def.category, label: def.label, monthly: byAccount.get(def.accountCode) || Array(12).fill(0) }));
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
