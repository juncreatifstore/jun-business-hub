import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { expensePaidTotal, listFinanceExpenses } from "@/lib/finance-expenses";

export const BUDGET_PREFIX = "finance.budget.plan.";
export const FISCAL_MONTHS = ["Sep","Oct","Nov","Déc","Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août"] as const;

export type BudgetPlanStatus = "DRAFT" | "APPROVED" | "LOCKED" | "ARCHIVED";
export type BudgetCategory =
  | "REVENUE" | "REFUNDS"
  | "AIRFARE" | "HOTEL" | "VISA_FEES" | "MARKETING" | "SOFTWARE" | "OFFICE"
  | "PAYROLL" | "PROFESSIONAL_SERVICES" | "BANK_FEES" | "TAXES" | "TRANSPORT"
  | "UTILITIES" | "OTHER_OPERATING";
export type BudgetLine = { category: BudgetCategory; label: string; monthly: number[] };
export type BudgetScenarioAssumptions = { bestRevenueMultiplier: number; bestCostMultiplier: number; worstRevenueMultiplier: number; worstCostMultiplier: number };
export type BudgetProject = { id: string; caseId: string; name: string; plannedRevenue: number; plannedCosts: number; note: string };
export type FinanceBudgetPlan = {
  id: string; name: string; year: number; currency: string; status: BudgetPlanStatus; lines: BudgetLine[];
  projects: BudgetProject[]; assumptions: BudgetScenarioAssumptions; note: string; createdById: string; approvedById: string | null;
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
function round(value:number){ return Math.round((value + Number.EPSILON) * 100) / 100; }
function planKey(id:string){ return `${BUDGET_PREFIX}${id}`; }
function safeMonthly(value:unknown){ const input=Array.isArray(value)?value:[]; return Array.from({length:12},(_,i)=>Math.max(0,round(Number(input[i]||0)))); }
function safeProject(value:any):BudgetProject|null{
  if(!value?.id || !value.caseId || !value.name) return null;
  return { id:String(value.id), caseId:String(value.caseId), name:String(value.name).slice(0,180), plannedRevenue:Math.max(0,round(Number(value.plannedRevenue||0))), plannedCosts:Math.max(0,round(Number(value.plannedCosts||0))), note:String(value.note||"").slice(0,500) };
}
function parsePlan(value:string):FinanceBudgetPlan|null{
  try{
    const p=JSON.parse(value) as FinanceBudgetPlan;
    if(!p?.id || !p.name || !Number.isInteger(p.year)) return null;
    return {
      ...p,
      currency:String(p.currency||"USD").toUpperCase(),
      lines:BUDGET_CATEGORIES.map(def=>{const found=Array.isArray(p.lines)?p.lines.find(line=>line.category===def.category):undefined;return{category:def.category,label:def.label,monthly:safeMonthly(found?.monthly)}}),
      projects:(Array.isArray((p as any).projects)?(p as any).projects:[]).map((item:unknown)=>safeProject(item)).filter((v:BudgetProject|null):v is BudgetProject=>v!==null),
      assumptions:{...DEFAULT_ASSUMPTIONS,...(p.assumptions||{})},
      note:String(p.note||""),
    };
  }catch{return null;}
}

/** Fiscal year FY2026 = 01 Sep 2025 through 30 Aug 2026. */
export function getBudgetFiscalPeriod(year:number){
  return { start:new Date(Date.UTC(year-1,8,1,0,0,0)), end:new Date(Date.UTC(year,7,30,23,59,59,999)) };
}
export function fiscalMonthIndex(date:Date, year:number){
  const {start,end}=getBudgetFiscalPeriod(year); const t=date.getTime(); if(t<start.getTime()||t>end.getTime()) return -1;
  const m=date.getUTCMonth(); return m>=8 ? m-8 : m+4;
}
export function getBudgetThroughMonth(plan:FinanceBudgetPlan, now=new Date()){
  const {start,end}=getBudgetFiscalPeriod(plan.year); if(now<start)return -1; if(now>end)return 11; return fiscalMonthIndex(now,plan.year);
}
export function currentFiscalYear(now=new Date()){
  const y=now.getUTCFullYear(); const sep1=new Date(Date.UTC(y,8,1)); return now>=sep1?y+1:y;
}

export function makeEmptyBudgetPlan(input:{name:string;year:number;currency:string;createdById:string}):FinanceBudgetPlan{
  const now=new Date().toISOString();
  return { id:randomUUID(), name:input.name.trim(), year:input.year, currency:input.currency.toUpperCase(), status:"DRAFT", lines:BUDGET_CATEGORIES.map(def=>({category:def.category,label:def.label,monthly:Array(12).fill(0)})), projects:[], assumptions:{...DEFAULT_ASSUMPTIONS}, note:"", createdById:input.createdById, approvedById:null, approvedAt:null, createdAt:now, updatedAt:now };
}
export async function listBudgetPlans(limit=200){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:BUDGET_PREFIX}},orderBy:{updatedAt:"desc"},take:limit,select:{value:true}});return rows.map(r=>parsePlan(r.value)).filter((v):v is FinanceBudgetPlan=>Boolean(v));}
export async function getBudgetPlan(id:string){const row=await prisma.appSetting.findUnique({where:{key:planKey(id)},select:{value:true}});return row?parsePlan(row.value):null;}
export async function saveBudgetPlan(plan:FinanceBudgetPlan){const normalized={...plan,currency:plan.currency.toUpperCase(),updatedAt:new Date().toISOString()};await prisma.appSetting.upsert({where:{key:planKey(plan.id)},create:{key:planKey(plan.id),value:JSON.stringify(normalized)},update:{value:JSON.stringify(normalized)}});return normalized;}
export function budgetAnnualTotal(line:BudgetLine){return round(line.monthly.reduce((s,v)=>s+v,0));}
export function budgetPlanAnnualTotals(plan:FinanceBudgetPlan){const revenue=budgetAnnualTotal(plan.lines.find(l=>l.category==="REVENUE")||{category:"REVENUE",label:"Revenue",monthly:[]});const costs=round(plan.lines.filter(l=>l.category!=="REVENUE").reduce((s,l)=>s+budgetAnnualTotal(l),0));return{revenue,costs,net:round(revenue-costs)};}

function emptyActualMap(){return new Map<BudgetCategory,number[]>(BUDGET_CATEGORIES.map(d=>[d.category,Array(12).fill(0)]));}
function addActual(map:Map<BudgetCategory,number[]>,category:BudgetCategory,date:Date,amount:number,plan:FinanceBudgetPlan){const idx=fiscalMonthIndex(date,plan.year);if(idx<0||!Number.isFinite(amount)||amount<=0)return;const monthly=map.get(category)!;monthly[idx]=round(monthly[idx]+amount);}
function expenseBudgetCategory(category:string):BudgetCategory|null{if(category==="OTHER")return"OTHER_OPERATING";if(category==="REFUNDS_COST")return null;return BUDGET_CATEGORIES.some(d=>d.category===category)?category as BudgetCategory:"OTHER_OPERATING";}

export async function getBudgetActuals(plan:FinanceBudgetPlan){
  const [payments,refunds,expenses]=await Promise.all([
    prisma.payment.findMany({where:{currency:plan.currency,status:{in:["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}},select:{id:true,amount:true,paidAt:true,createdAt:true}}),
    prisma.refund.findMany({where:{currency:plan.currency},include:{installments:{select:{amount:true,status:true,paidAt:true}}}}),
    listFinanceExpenses(5000),
  ]);
  const metaMap=await getPaymentCoreMetaMap(payments.map(p=>p.id)); const map=emptyActualMap();
  for(const p of payments){const date=new Date(p.paidAt||p.createdAt);addActual(map,"REVENUE",date,Number(p.amount),plan);const fee=Number(metaMap.get(p.id)?.feeAmount||0);if(fee>0)addActual(map,"BANK_FEES",date,fee,plan);}
  for(const refund of refunds)for(const inst of refund.installments){if(inst.status==="PAID"&&inst.paidAt)addActual(map,"REFUNDS",new Date(inst.paidAt),Number(inst.amount),plan);}
  for(const expense of expenses){if(expense.currency!==plan.currency||["REJECTED","CANCELLED"].includes(expense.status))continue;const category=expenseBudgetCategory(expense.category);if(!category)continue;for(const payment of expense.payments)addActual(map,category,new Date(payment.paidAt),Number(payment.amount),plan);if(expense.status==="PAID"&&expense.payments.length===0&&expensePaidTotal(expense)===0)addActual(map,category,new Date(expense.updatedAt),Number(expense.amount),plan);}
  return BUDGET_CATEGORIES.map(def=>({category:def.category,label:def.label,monthly:map.get(def.category)!}));
}

export async function getBudgetSyncHealth(plan:FinanceBudgetPlan){
  const {start,end}=getBudgetFiscalPeriod(plan.year);
  const [payments,refunds,expenses]=await Promise.all([
    prisma.payment.findMany({where:{currency:plan.currency,status:{in:["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}},select:{updatedAt:true,paidAt:true,createdAt:true}}),
    prisma.refund.findMany({where:{currency:plan.currency},select:{updatedAt:true}}),
    listFinanceExpenses(5000),
  ]);
  const pp=payments.filter(p=>{const d=new Date(p.paidAt||p.createdAt);return d>=start&&d<=end});
  const ee=expenses.filter(e=>e.currency===plan.currency&&new Date(e.updatedAt)<=end);
  const latestTs=Math.max(...pp.map(p=>p.updatedAt.getTime()),...refunds.map(r=>r.updatedAt.getTime()),...ee.map(e=>new Date(e.updatedAt).getTime()),0);
  return {ok:true,source:"Finance JUN en temps réel",paymentCount:pp.length,refundCount:refunds.length,expenseCount:ee.length,lastFinanceUpdate:latestTs?new Date(latestTs):null,explanation:`Période budgétaire : 01 septembre ${plan.year-1} au 30 août ${plan.year}. Réel = paiements confirmés + remboursements payés + dépenses payées + frais de paiement.`};
}

export async function getBudgetVariance(plan:FinanceBudgetPlan,throughMonth=11){
  const actuals=await getBudgetActuals(plan);const hasStarted=throughMonth>=0;const month=Math.min(11,Math.max(0,throughMonth));
  const rows:BudgetVarianceRow[]=BUDGET_CATEGORIES.map(def=>{const b=plan.lines.find(l=>l.category===def.category)!;const a=actuals.find(l=>l.category===def.category)!;const budget=hasStarted?round(b.monthly.slice(0,month+1).reduce((s,v)=>s+v,0)):0;const actual=hasStarted?round(a.monthly.slice(0,month+1).reduce((s,v)=>s+v,0)):0;const rawVariance=round(actual-budget);const favorableVariance=def.kind==="REVENUE"?rawVariance:round(-rawVariance);const utilizationPercent=budget>0?round(actual/budget*100):actual>0?null:0;let status:BudgetVarianceRow["status"]="ON_TRACK";if(hasStarted&&def.kind==="REVENUE"){if(budget>0&&actual<budget*.9)status="UNDER_TARGET";else if(budget>0&&actual<budget)status="WATCH";}else if(hasStarted){if((budget===0&&actual>0)||(budget>0&&actual>budget))status="OVER_BUDGET";else if(budget>0&&actual>=budget*.9)status="WATCH";}return{category:def.category,label:def.label,budget,actual,rawVariance,favorableVariance,utilizationPercent,status};});
  const totals={budgetRevenue:rows.find(r=>r.category==="REVENUE")?.budget||0,actualRevenue:rows.find(r=>r.category==="REVENUE")?.actual||0,budgetCosts:round(rows.filter(r=>r.category!=="REVENUE").reduce((s,r)=>s+r.budget,0)),actualCosts:round(rows.filter(r=>r.category!=="REVENUE").reduce((s,r)=>s+r.actual,0))};return{rows,totals:{...totals,budgetNet:round(totals.budgetRevenue-totals.budgetCosts),actualNet:round(totals.actualRevenue-totals.actualCosts)}};
}

export async function getBudgetScenarios(plan:FinanceBudgetPlan,asOf=new Date()){
  const actuals=await getBudgetActuals(plan);const currentMonth=getBudgetThroughMonth(plan,asOf);const scenarios=[{name:"BEST" as const,revenueMultiplier:plan.assumptions.bestRevenueMultiplier,costMultiplier:plan.assumptions.bestCostMultiplier},{name:"BASE" as const,revenueMultiplier:1,costMultiplier:1},{name:"WORST" as const,revenueMultiplier:plan.assumptions.worstRevenueMultiplier,costMultiplier:plan.assumptions.worstCostMultiplier}];
  return scenarios.map(scenario=>{let revenue=0,costs=0;for(const def of BUDGET_CATEGORIES){const b=plan.lines.find(l=>l.category===def.category)!;const a=actuals.find(l=>l.category===def.category)!;const realized=currentMonth>=0?a.monthly.slice(0,currentMonth+1).reduce((s,v)=>s+v,0):0;const future=currentMonth<11?b.monthly.slice(currentMonth+1).reduce((s,v)=>s+v,0):0;const projected=round(realized+future*(def.kind==="REVENUE"?scenario.revenueMultiplier:scenario.costMultiplier));if(def.kind==="REVENUE")revenue+=projected;else costs+=projected;}return{scenario:scenario.name,revenue:round(revenue),costs:round(costs),net:round(revenue-costs)};});
}
export async function getBudgetAlerts(plan:FinanceBudgetPlan,throughMonth:number){if(throughMonth<0)return[];const variance=await getBudgetVariance(plan,throughMonth);return variance.rows.filter(r=>r.status!=="ON_TRACK").sort((a,b)=>Math.abs(b.rawVariance)-Math.abs(a.rawVariance));}

export async function getBudgetProjectPerformance(plan:FinanceBudgetPlan){
  if(!plan.projects.length)return[];
  const caseIds=[...new Set(plan.projects.map(p=>p.caseId))];
  const [cases,payments,refunds,expenses]=await Promise.all([
    prisma.case.findMany({where:{id:{in:caseIds}},select:{id:true,caseNumber:true,title:true,status:true}}),
    prisma.payment.findMany({where:{caseId:{in:caseIds},currency:plan.currency,status:{in:["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}},select:{id:true,caseId:true,amount:true,paidAt:true,createdAt:true}}),
    prisma.refund.findMany({where:{caseId:{in:caseIds},currency:plan.currency},select:{caseId:true,installments:{select:{amount:true,status:true,paidAt:true}}}}),
    listFinanceExpenses(5000),
  ]);
  const meta=await getPaymentCoreMetaMap(payments.map(p=>p.id)); const period=getBudgetFiscalPeriod(plan.year); const caseMap=new Map(cases.map(c=>[c.id,c]));
  return plan.projects.map(project=>{
    const pp=payments.filter(p=>p.caseId===project.caseId&&(()=>{const d=new Date(p.paidAt||p.createdAt);return d>=period.start&&d<=period.end})());
    const actualRevenue=round(pp.reduce((s,p)=>s+Number(p.amount),0)); const fees=round(pp.reduce((s,p)=>s+Number(meta.get(p.id)?.feeAmount||0),0));
    const refundPaid=round(refunds.filter(r=>r.caseId===project.caseId).flatMap(r=>r.installments).filter(i=>i.status==="PAID"&&i.paidAt&&new Date(i.paidAt)>=period.start&&new Date(i.paidAt)<=period.end).reduce((s,i)=>s+Number(i.amount),0));
    const expensePaid=round(expenses.filter(e=>e.caseId===project.caseId&&e.currency===plan.currency&&!['REJECTED','CANCELLED'].includes(e.status)).reduce((sum,e)=>sum+e.payments.filter(p=>{const d=new Date(p.paidAt);return d>=period.start&&d<=period.end}).reduce((s,p)=>s+Number(p.amount),0),0));
    const actualCosts=round(refundPaid+expensePaid+fees); const actualProfit=round(actualRevenue-actualCosts); const plannedProfit=round(project.plannedRevenue-project.plannedCosts); const margin=actualRevenue>0?round(actualProfit/actualRevenue*100):null;
    const c=caseMap.get(project.caseId);
    return {...project,caseNumber:c?.caseNumber||"—",caseTitle:c?.title||project.name,caseStatus:c?.status||"UNKNOWN",actualRevenue,refundPaid,expensePaid,fees,actualCosts,actualProfit,plannedProfit,margin,profitVariance:round(actualProfit-plannedProfit)};
  });
}
