import "server-only";

import { prisma } from "@/lib/prisma";
import { invoiceFinancialState, listInvoices } from "@/lib/finance-invoices";
import { expenseEffectiveStatus, expensePaidTotal, listFinanceExpenses } from "@/lib/finance-expenses";

function round(v:number){return Math.round((v+Number.EPSILON)*100)/100;}
export type AdminRisk="LOW"|"MEDIUM"|"HIGH"|"CRITICAL";
function riskLevel(score:number):AdminRisk{return score>=75?"CRITICAL":score>=45?"HIGH":score>=20?"MEDIUM":"LOW";}

export async function getCaseAdminOverview(){
 const [cases,allInvoices,allExpenses]=await Promise.all([
  prisma.case.findMany({
   orderBy:[{priority:"desc"},{dueDate:"asc"},{createdAt:"desc"}],take:300,
   include:{
    client:{select:{id:true,internalId:true,firstName:true,lastName:true}},
    owner:{select:{id:true,firstName:true,lastName:true,email:true}},
    tasks:{select:{id:true,status:true,dueDate:true}},
    refunds:{include:{installments:{select:{amount:true,status:true}}}},
   },
  }),
  listInvoices(5000),listFinanceExpenses(5000),
 ]);
 const invoiceStates=await Promise.all(allInvoices.map(async invoice=>({invoice,state:await invoiceFinancialState(invoice)})));
 const invoiceMap=new Map<string,typeof invoiceStates>();
 for(const row of invoiceStates){if(!row.invoice.caseId)continue;const list=invoiceMap.get(row.invoice.caseId)||[];list.push(row);invoiceMap.set(row.invoice.caseId,list);}
 const expenseMap=new Map<string,typeof allExpenses>();
 for(const e of allExpenses){if(!e.caseId)continue;const list=expenseMap.get(e.caseId)||[];list.push(e);expenseMap.set(e.caseId,list);}
 const now=Date.now();
 const rows=cases.map(c=>{
  const invoices=(invoiceMap.get(c.id)||[]).filter(x=>x.invoice.status!=="CANCELLED");
  const expenses=(expenseMap.get(c.id)||[]).filter(e=>!["REJECTED","CANCELLED"].includes(expenseEffectiveStatus(e)));
  const openTasks=c.tasks.filter(t=>!["DONE","CANCELLED"].includes(t.status));
  const overdueTasks=openTasks.filter(t=>t.dueDate&&t.dueDate.getTime()<now);
  const caseOverdue=Boolean(c.dueDate&&c.dueDate.getTime()<now&&!["COMPLETED","CANCELLED","ARCHIVED"].includes(c.status));
  const billed=round(invoices.reduce((s,x)=>s+Number(x.invoice.total),0));
  const invoicePaid=round(invoices.reduce((s,x)=>s+x.state.paid,0));
  const receivable=round(invoices.reduce((s,x)=>s+x.state.balance,0));
  const overdueInvoices=invoices.filter(x=>x.state.overdue&&x.state.balance>0.009).length;
  let approvedRefunds=0,refundsPaid=0,openRefunds=0;
  for(const r of c.refunds){if(["REJECTED","CANCELLED"].includes(r.status))continue;const amount=Number(r.amount);const paid=r.installments.filter(i=>i.status==="PAID").reduce((s,i)=>s+Number(i.amount),0);if(["APPROVED","PARTIALLY_PAID","PAID"].includes(r.status))approvedRefunds+=amount;refundsPaid+=paid;if(amount-paid>0.009)openRefunds++;}
  const expensePaid=round(expenses.reduce((s,e)=>s+expensePaidTotal(e),0));
  const openExpenses=expenses.filter(e=>!["PAID"].includes(expenseEffectiveStatus(e))).length;
  const realizedProfit=round(invoicePaid-refundsPaid-expensePaid);
  let score=0;
  if(caseOverdue)score+=22;
  if(overdueTasks.length)score+=Math.min(22,12+overdueTasks.length*2);
  if(receivable>0.009)score+=18;
  if(overdueInvoices)score+=12;
  if(openRefunds)score+=28;
  if(openExpenses)score+=16;
  if(realizedProfit<0)score+=18;
  if(c.priority==="URGENT")score+=10;
  score=Math.min(100,score);
  return {id:c.id,caseNumber:c.caseNumber,title:c.title,type:c.type,status:c.status,priority:c.priority,dueDate:c.dueDate,createdAt:c.createdAt,client:c.client,owner:c.owner,openTasks:openTasks.length,overdueTasks:overdueTasks.length,caseOverdue,billed,invoicePaid,receivable,approvedRefunds:round(approvedRefunds),refundsPaid:round(refundsPaid),openRefunds,expensePaid,openExpenses,realizedProfit,riskScore:score,riskLevel:riskLevel(score)};
 });
 const active=rows.filter(r=>!["COMPLETED","CANCELLED","ARCHIVED"].includes(r.status));
 const workloadMap=new Map<string,{ownerId:string|null;ownerName:string;activeCases:number;openTasks:number;overdueCases:number;highRisk:number}>();
 for(const r of active){const key=r.owner?.id||"UNASSIGNED";const w=workloadMap.get(key)||{ownerId:r.owner?.id||null,ownerName:r.owner?`${r.owner.firstName} ${r.owner.lastName}`:"Unassigned",activeCases:0,openTasks:0,overdueCases:0,highRisk:0};w.activeCases++;w.openTasks+=r.openTasks;if(r.caseOverdue)w.overdueCases++;if(["HIGH","CRITICAL"].includes(r.riskLevel))w.highRisk++;workloadMap.set(key,w);}
 const totals={total:rows.length,active:active.length,overdue:active.filter(r=>r.caseOverdue).length,highRisk:active.filter(r=>["HIGH","CRITICAL"].includes(r.riskLevel)).length,unassigned:active.filter(r=>!r.owner).length,openTasks:active.reduce((s,r)=>s+r.openTasks,0),receivable:round(active.reduce((s,r)=>s+r.receivable,0)),realizedProfit:round(rows.reduce((s,r)=>s+r.realizedProfit,0))};
 return {rows,totals,workload:[...workloadMap.values()].sort((a,b)=>b.activeCases-a.activeCases||b.openTasks-a.openTasks)};
}
