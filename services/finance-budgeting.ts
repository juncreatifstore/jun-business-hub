"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  BUDGET_CATEGORIES,
  getBudgetPlan,
  listBudgetPlans,
  makeEmptyBudgetPlan,
  saveBudgetPlan,
  type FinanceBudgetPlan,
} from "@/lib/finance-budgeting";

function money(value: FormDataEntryValue | null) {
  const n = Number(String(value ?? "0").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Budget amounts must be valid non-negative numbers");
  return Math.round(n * 100) / 100;
}
function multiplier(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n <= 0 || n > 5) throw new Error("Scenario multiplier must be greater than 0 and at most 5");
  return Math.round(n * 1000) / 1000;
}
function refresh(id?: string) {
  revalidatePath("/app/finance/budgeting");
  if (id) revalidatePath(`/app/finance/budgeting/${id}`);
  revalidatePath("/app/finance");
  revalidatePath("/app/finance/intelligence");
}

export async function createBudgetPlanAction(formData: FormData) {
  const user = await assertPermission("BUDGET_CREATE");
  const name = String(formData.get("name") || "").trim();
  const year = Number(formData.get("year"));
  const currency = String(formData.get("currency") || "").trim().toUpperCase();
  if (name.length < 3) redirect(`/app/finance/budgeting/new?error=${encodeURIComponent("Budget name is required.")}`);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) redirect(`/app/finance/budgeting/new?error=${encodeURIComponent("Invalid budget year.")}`);
  if (!/^[A-Z]{3}$/.test(currency)) redirect(`/app/finance/budgeting/new?error=${encodeURIComponent("Currency must be a 3-letter code.")}`);
  const plan = makeEmptyBudgetPlan({ name, year, currency, createdById: user.id });
  await saveBudgetPlan(plan);
  await audit({ userId: user.id, action: "BUDGET_CREATE", resourceType: "BudgetPlan", resourceId: plan.id, after: { name, year, currency } });
  refresh(plan.id);
  redirect(`/app/finance/budgeting/${plan.id}?success=${encodeURIComponent("Budget draft created. Enter monthly allocations below.")}`);
}

export async function updateBudgetPlanAction(id: string, formData: FormData) {
  const user = await assertPermission("BUDGET_CREATE");
  const plan = await getBudgetPlan(id);
  if (!plan) throw new Error("Budget plan not found");
  if (plan.status !== "DRAFT") redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Only DRAFT budgets can be edited. Create a revision instead.")}`);
  const lines = BUDGET_CATEGORIES.map((def) => ({
    category: def.category,
    label: def.label,
    monthly: Array.from({ length: 12 }, (_, month) => money(formData.get(`budget_${def.category}_${month}`))),
  }));
  const updated: FinanceBudgetPlan = {
    ...plan,
    name: String(formData.get("name") || plan.name).trim().slice(0, 120),
    note: String(formData.get("note") || "").trim().slice(0, 1000),
    lines,
    assumptions: {
      bestRevenueMultiplier: multiplier(formData.get("bestRevenueMultiplier"), plan.assumptions.bestRevenueMultiplier),
      bestCostMultiplier: multiplier(formData.get("bestCostMultiplier"), plan.assumptions.bestCostMultiplier),
      worstRevenueMultiplier: multiplier(formData.get("worstRevenueMultiplier"), plan.assumptions.worstRevenueMultiplier),
      worstCostMultiplier: multiplier(formData.get("worstCostMultiplier"), plan.assumptions.worstCostMultiplier),
    },
  };
  await saveBudgetPlan(updated);
  await audit({ userId: user.id, action: "BUDGET_UPDATE", resourceType: "BudgetPlan", resourceId: id, before: { status: plan.status }, after: { name: updated.name, year: updated.year, currency: updated.currency } });
  refresh(id);
  redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent("Budget allocations saved.")}`);
}

export async function approveBudgetPlanAction(id: string) {
  const user = await assertPermission("BUDGET_APPROVE");
  const plan = await getBudgetPlan(id);
  if (!plan) throw new Error("Budget plan not found");
  if (plan.status !== "DRAFT") redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Only a DRAFT budget can be approved.")}`);
  const plans = await listBudgetPlans();
  const active = plans.find((p) => p.id !== id && p.year === plan.year && p.currency === plan.currency && ["APPROVED", "LOCKED"].includes(p.status));
  if (active) redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent(`Archive the active ${plan.year} ${plan.currency} budget before approving this revision.`)}`);
  const now = new Date().toISOString();
  await saveBudgetPlan({ ...plan, status: "APPROVED", approvedById: user.id, approvedAt: now });
  await audit({ userId: user.id, action: "BUDGET_APPROVE", resourceType: "BudgetPlan", resourceId: id, before: { status: plan.status }, after: { status: "APPROVED", approvedAt: now } });
  refresh(id);
  redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent("Budget approved and frozen for variance reporting.")}`);
}

export async function setBudgetPlanStatusAction(id: string, formData: FormData) {
  const user = await assertPermission("BUDGET_APPROVE");
  const plan = await getBudgetPlan(id);
  if (!plan) throw new Error("Budget plan not found");
  const next = String(formData.get("status") || "") as FinanceBudgetPlan["status"];
  const allowed: Record<FinanceBudgetPlan["status"], FinanceBudgetPlan["status"][]> = {
    DRAFT: ["ARCHIVED"], APPROVED: ["LOCKED", "ARCHIVED"], LOCKED: ["ARCHIVED"], ARCHIVED: [],
  };
  if (!allowed[plan.status].includes(next)) redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent(`Invalid budget transition ${plan.status} → ${next}.`)}`);
  await saveBudgetPlan({ ...plan, status: next });
  await audit({ userId: user.id, action: `BUDGET_${next}`, resourceType: "BudgetPlan", resourceId: id, before: { status: plan.status }, after: { status: next } });
  refresh(id);
  redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent(`Budget marked ${next}.`)}`);
}

export async function cloneBudgetPlanAction(id: string) {
  const user = await assertPermission("BUDGET_CREATE");
  const plan = await getBudgetPlan(id);
  if (!plan) throw new Error("Budget plan not found");
  const clone = makeEmptyBudgetPlan({ name: `${plan.name} — Revision`, year: plan.year, currency: plan.currency, createdById: user.id });
  clone.lines = plan.lines.map((line) => ({ ...line, monthly: [...line.monthly] }));
  clone.assumptions = { ...plan.assumptions };
  clone.note = `Revision cloned from ${plan.name}.`;
  await saveBudgetPlan(clone);
  await audit({ userId: user.id, action: "BUDGET_CLONE", resourceType: "BudgetPlan", resourceId: clone.id, after: { sourceBudgetId: id, year: clone.year, currency: clone.currency } });
  refresh(clone.id);
  redirect(`/app/finance/budgeting/${clone.id}?success=${encodeURIComponent("Budget revision created from prior plan.")}`);
}
