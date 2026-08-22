import "server-only";

import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { getClientServiceSummaries } from "@/lib/client-service-summary";
import { expenseEffectiveStatus, expensePaidTotal, expenseRemaining, listFinanceExpenses, type FinanceExpense } from "@/lib/finance-expenses";

function round(v:number){ return Math.round((v + Number.EPSILON) * 100) / 100; }

type ProfitabilityCurrency = {
  currency:string;
  netReceived:number;
  refundsPaid:number;
  approvedRefunds:number;
  netRetained:number;
  actualCost:number;
  committedCost:number;
  openCost:number;
  realizedProfit:number;
  projectedProfit:number;
  realizedMargin:number|null;
  projectedMargin:number|null;
};

export async function getClientProfitabilityOverview(clientId:string){
  const [finance, services, allExpenses] = await Promise.all([
    getClientFinanceOverview(clientId),
    getClientServiceSummaries(clientId),
    listFinanceExpenses(5000),
  ]);

  const expenses = allExpenses.filter((e)=>e.clientId===clientId);
  const caseIds = new Set(services.map((s)=>s.caseId));
  const unassignedExpenses = expenses.filter((e)=>!e.caseId || !caseIds.has(e.caseId));
  const byCurrency = new Map<string,ProfitabilityCurrency>();
  const bucket=(currency:string)=>{
    const key=currency.toUpperCase();
    const existing=byCurrency.get(key); if(existing) return existing;
    const value:ProfitabilityCurrency={currency:key,netReceived:0,refundsPaid:0,approvedRefunds:0,netRetained:0,actualCost:0,committedCost:0,openCost:0,realizedProfit:0,projectedProfit:0,realizedMargin:null,projectedMargin:null};
    byCurrency.set(key,value); return value;
  };

  for(const s of finance.summaries){
    const b=bucket(s.currency);
    b.netReceived=round(b.netReceived+s.netReceived);
    b.refundsPaid=round(b.refundsPaid+s.refundPaid);
    b.approvedRefunds=round(b.approvedRefunds+s.approvedRefunds);
  }

  for(const expense of expenses){
    const status=expenseEffectiveStatus(expense);
    if(["REJECTED","CANCELLED"].includes(status)) continue;
    const b=bucket(expense.currency);
    const paid=expensePaidTotal(expense);
    b.actualCost=round(b.actualCost+paid);
    if(["APPROVED","PARTIALLY_PAID","PAID"].includes(status)) b.committedCost=round(b.committedCost+expense.amount);
    b.openCost=round(b.openCost+expenseRemaining(expense));
  }

  for(const b of byCurrency.values()){
    b.netRetained=round(b.netReceived-b.refundsPaid);
    b.realizedProfit=round(b.netRetained-b.actualCost);
    b.projectedProfit=round(b.netReceived-b.approvedRefunds-b.committedCost);
    b.realizedMargin=b.netRetained>0?round((b.realizedProfit/b.netRetained)*100):null;
    const projectedRevenue=round(b.netReceived-b.approvedRefunds);
    b.projectedMargin=projectedRevenue>0?round((b.projectedProfit/projectedRevenue)*100):null;
  }

  const expenseRows=expenses.map((e:FinanceExpense)=>{
    const status=expenseEffectiveStatus(e);
    return {...e,effectiveStatus:status,paidTotal:expensePaidTotal(e),remaining:expenseRemaining(e)};
  }).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());

  const serviceRows=services.map((service)=>({
    ...service,
    hasLoss:service.currencies.some((c)=>c.profit<0),
    hasUnpaidCost:service.currencies.some((c)=>c.committedCost>c.actualCost),
  }));

  return {
    summaries:[...byCurrency.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),
    services:serviceRows,
    expenses:expenseRows,
    unassignedExpenses,
    alerts:{
      lossServices:serviceRows.filter((s)=>s.hasLoss),
      unpaidCommittedCosts:serviceRows.filter((s)=>s.hasUnpaidCost),
      expensesWithoutCase:unassignedExpenses.filter((e)=>!["REJECTED","CANCELLED"].includes(expenseEffectiveStatus(e))),
      draftOrSubmittedExpenses:expenseRows.filter((e)=>["DRAFT","SUBMITTED"].includes(e.effectiveStatus)),
    },
  };
}
