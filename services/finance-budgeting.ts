"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
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
  if (!Number.isFinite(n) || n < 0) throw new Error("Les montants du budget doivent être des nombres positifs valides");
  return Math.round(n * 100) / 100;
}
function multiplier(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n <= 0 || n > 5) throw new Error("Le multiplicateur doit être supérieur à 0 et inférieur ou égal à 5");
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
  if (name.length < 3) redirect(`/app/finance/budgeting/new?error=${encodeURIComponent("Le nom du budget est obligatoire.")}`);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) redirect(`/app/finance/budgeting/new?error=${encodeURIComponent("Année budgétaire invalide.")}`);
  if (!/^[A-Z]{3}$/.test(currency)) redirect(`/app/finance/budgeting/new?error=${encodeURIComponent("La devise doit contenir 3 lettres.")}`);
  const plan = makeEmptyBudgetPlan({ name, year, currency, createdById: user.id });
  await saveBudgetPlan(plan);
  await audit({ userId: user.id, action: "BUDGET_CREATE", resourceType: "BudgetPlan", resourceId: plan.id, after: { name, year, currency, fiscalStart:`${year-1}-09-01`, fiscalEnd:`${year}-08-30` } });
  refresh(plan.id);
  redirect(`/app/finance/budgeting/${plan.id}?success=${encodeURIComponent("Budget créé. Planifiez maintenant revenus, dépenses et projets.")}`);
}

export async function updateBudgetPlanAction(id: string, formData: FormData) {
  const user = await assertPermission("BUDGET_CREATE");
  const plan = await getBudgetPlan(id);
  if (!plan) throw new Error("Budget introuvable");
  if (plan.status !== "DRAFT") redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Seul un budget brouillon peut être modifié. Créez une révision.")}`);
  const lines = BUDGET_CATEGORIES.map((def) => ({ category: def.category, label: def.label, monthly: Array.from({ length: 12 }, (_, month) => money(formData.get(`budget_${def.category}_${month}`))) }));
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
  await audit({ userId: user.id, action: "BUDGET_UPDATE", resourceType: "BudgetPlan", resourceId: id, after: { name: updated.name, year: updated.year, currency: updated.currency } });
  refresh(id);
  redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent("Prévisions budgétaires enregistrées.")}`);
}

export async function addBudgetProjectAction(id:string, formData:FormData){
  const user=await assertPermission("BUDGET_CREATE");
  const plan=await getBudgetPlan(id); if(!plan) throw new Error("Budget introuvable");
  if(plan.status!=="DRAFT") redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Les projets peuvent être ajoutés uniquement dans un budget brouillon.")}`);
  const caseId=String(formData.get("caseId")||"").trim();
  const caseRow=await prisma.case.findUnique({where:{id:caseId},select:{id:true,caseNumber:true,title:true}});
  if(!caseRow) redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Dossier / projet introuvable.")}`);
  if(plan.projects.some(p=>p.caseId===caseId)) redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Ce projet est déjà attaché à ce budget.")}`);
  const project={id:randomUUID(),caseId,name:`${caseRow.caseNumber} · ${caseRow.title}`,plannedRevenue:money(formData.get("plannedRevenue")),plannedCosts:money(formData.get("plannedCosts")),note:String(formData.get("projectNote")||"").trim().slice(0,500)};
  await saveBudgetPlan({...plan,projects:[...plan.projects,project]});
  await audit({userId:user.id,action:"BUDGET_PROJECT_ADD",resourceType:"BudgetPlan",resourceId:id,after:project});
  refresh(id); redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent("Projet ajouté au budget.")}`);
}

export async function updateBudgetProjectAction(id:string, projectId:string, formData:FormData){
  const user=await assertPermission("BUDGET_CREATE"); const plan=await getBudgetPlan(id); if(!plan)throw new Error("Budget introuvable");
  if(plan.status!=="DRAFT")return;
  const projects=plan.projects.map(p=>p.id===projectId?{...p,plannedRevenue:money(formData.get("plannedRevenue")),plannedCosts:money(formData.get("plannedCosts")),note:String(formData.get("projectNote")||p.note).trim().slice(0,500)}:p);
  await saveBudgetPlan({...plan,projects}); await audit({userId:user.id,action:"BUDGET_PROJECT_UPDATE",resourceType:"BudgetPlan",resourceId:id,after:{projectId}}); refresh(id);
}

export async function removeBudgetProjectAction(id:string, projectId:string){
  const user=await assertPermission("BUDGET_CREATE"); const plan=await getBudgetPlan(id); if(!plan)throw new Error("Budget introuvable");
  if(plan.status!=="DRAFT")return;
  await saveBudgetPlan({...plan,projects:plan.projects.filter(p=>p.id!==projectId)}); await audit({userId:user.id,action:"BUDGET_PROJECT_REMOVE",resourceType:"BudgetPlan",resourceId:id,after:{projectId}}); refresh(id);
}

export async function approveBudgetPlanAction(id: string) {
  const user = await assertPermission("BUDGET_APPROVE");
  const plan = await getBudgetPlan(id); if (!plan) throw new Error("Budget introuvable");
  if (plan.status !== "DRAFT") redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Seul un brouillon peut être approuvé.")}`);
  const plans = await listBudgetPlans();
  const active = plans.find((p) => p.id !== id && p.year === plan.year && p.currency === plan.currency && ["APPROVED", "LOCKED"].includes(p.status));
  if (active) redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent(`Archivez d'abord le budget actif FY${plan.year} ${plan.currency}.`)}`);
  const now = new Date().toISOString(); await saveBudgetPlan({ ...plan, status: "APPROVED", approvedById: user.id, approvedAt: now });
  await audit({ userId: user.id, action: "BUDGET_APPROVE", resourceType: "BudgetPlan", resourceId: id, after: { status: "APPROVED", approvedAt: now } }); refresh(id);
  redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent("Budget approuvé et figé pour le suivi des performances.")}`);
}

export async function setBudgetPlanStatusAction(id: string, formData: FormData) {
  const user = await assertPermission("BUDGET_APPROVE"); const plan = await getBudgetPlan(id); if (!plan) throw new Error("Budget introuvable");
  const next = String(formData.get("status") || "") as FinanceBudgetPlan["status"];
  const allowed: Record<FinanceBudgetPlan["status"], FinanceBudgetPlan["status"][]> = { DRAFT:["ARCHIVED"], APPROVED:["LOCKED","ARCHIVED"], LOCKED:["ARCHIVED"], ARCHIVED:[] };
  if (!allowed[plan.status].includes(next)) redirect(`/app/finance/budgeting/${id}?error=${encodeURIComponent("Transition de statut invalide.")}`);
  await saveBudgetPlan({ ...plan, status: next }); await audit({ userId:user.id, action:`BUDGET_${next}`, resourceType:"BudgetPlan", resourceId:id, after:{status:next} }); refresh(id);
  redirect(`/app/finance/budgeting/${id}?success=${encodeURIComponent(`Budget : ${next}.`)}`);
}

export async function cloneBudgetPlanAction(id: string) {
  const user = await assertPermission("BUDGET_CREATE"); const plan = await getBudgetPlan(id); if (!plan) throw new Error("Budget introuvable");
  const clone = makeEmptyBudgetPlan({ name: `${plan.name} — Révision`, year: plan.year, currency: plan.currency, createdById: user.id });
  clone.lines = plan.lines.map((line) => ({ ...line, monthly: [...line.monthly] })); clone.projects=plan.projects.map(p=>({...p,id:randomUUID()})); clone.assumptions = { ...plan.assumptions }; clone.note = `Révision de ${plan.name}.`;
  await saveBudgetPlan(clone); await audit({ userId:user.id, action:"BUDGET_CLONE", resourceType:"BudgetPlan", resourceId:clone.id, after:{sourceBudgetId:id,year:clone.year,currency:clone.currency} }); refresh(clone.id);
  redirect(`/app/finance/budgeting/${clone.id}?success=${encodeURIComponent("Révision budgétaire créée.")}`);
}
