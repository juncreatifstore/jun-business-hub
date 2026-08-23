import "server-only";

import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { invoiceFinancialState, listInvoices, type FinanceInvoice } from "@/lib/finance-invoices";
import { expenseEffectiveStatus, expensePaidTotal, expenseRemaining, listFinanceExpenses } from "@/lib/finance-expenses";

function round(v:number){return Math.round((v+Number.EPSILON)*100)/100;}

type CaseCurrencySummary={
 currency:string;
 grossDirectReceived:number;
 transferFees:number;
 netDirectReceived:number;
 appliedToCase:number;
 unappliedDirectFunds:number;
 billed:number;
 invoicePaid:number;
 receivable:number;
 approvedRefunds:number;
 refundsPaid:number;
 expensePaid:number;
 committedCost:number;
 pendingApprovalCost:number;
 realizedProfit:number;
 forecastProfit:number;
 realizedMarginPercent:number|null;
 forecastMarginPercent:number|null;
};

export async function getCaseFinanceOverview(caseId:string){
 const c=await prisma.case.findUnique({where:{id:caseId},select:{id:true,caseNumber:true,title:true,type:true,status:true,clientId:true,client:{select:{firstName:true,lastName:true,internalId:true}}}});
 if(!c)return null;
 const [allInvoices,allExpenses,caseRefunds]=await Promise.all([
  listInvoices(5000),listFinanceExpenses(5000),
  prisma.refund.findMany({where:{caseId},orderBy:{createdAt:"desc"},include:{installments:{select:{amount:true,status:true,paidAt:true}}}}),
 ]);
 const invoices=allInvoices.filter(i=>i.caseId===caseId);
 const expenses=allExpenses.filter(e=>e.caseId===caseId);
 const linkedPaymentIds=[...new Set(invoices.flatMap(i=>i.payments.map(p=>p.paymentId)).filter(Boolean))];
 const payments=await prisma.payment.findMany({
  where:{OR:[{caseId},...(linkedPaymentIds.length?[{id:{in:linkedPaymentIds}}]:[])]},
  orderBy:[{paidAt:"desc"},{createdAt:"desc"}],
  select:{id:true,reference:true,clientId:true,caseId:true,amount:true,currency:true,status:true,method:true,provider:true,providerRef:true,paidAt:true,createdAt:true},
 });
 const paymentIds=payments.map(p=>p.id);
 const metaMap=await getPaymentCoreMetaMap(paymentIds);

 // Compare this Case allocation with allocations across every invoice so a payment shared by several Cases is never double-counted.
 const allClientInvoices=allInvoices.filter(i=>i.clientId===c.clientId&&i.status!=="CANCELLED");
 const totalAllocation=new Map<string,number>();
 const caseAllocation=new Map<string,number>();
 for(const invoice of allClientInvoices){
  for(const link of invoice.payments){
   if(!paymentIds.includes(link.paymentId))continue;
   const amount=Math.max(0,Number(link.amountApplied||0));
   totalAllocation.set(link.paymentId,round((totalAllocation.get(link.paymentId)||0)+amount));
   if(invoice.caseId===caseId)caseAllocation.set(link.paymentId,round((caseAllocation.get(link.paymentId)||0)+amount));
  }
 }

 const paymentRows=payments.map(p=>{
  const gross=round(Number(p.amount));
  const fee=round(Math.max(0,Number(metaMap.get(p.id)?.feeAmount||0)));
  const net=round(Math.max(0,gross-fee));
  const requestedCase=round(Math.max(0,caseAllocation.get(p.id)||0));
  const requestedTotal=round(Math.max(0,totalAllocation.get(p.id)||0));
  const appliedToCase=round(Math.min(net,requestedCase));
  const actualAllocatedTotal=round(Math.min(net,requestedTotal));
  const allocatedElsewhere=round(Math.max(0,actualAllocatedTotal-appliedToCase));
  const unapplied=round(Math.max(0,net-actualAllocatedTotal));
  const overallocated=round(Math.max(0,requestedTotal-net));
  return {...p,gross,fee,net,appliedToCase,allocatedElsewhere,unapplied,overallocated,directCasePayment:p.caseId===caseId,serviceLabel:metaMap.get(p.id)?.serviceLabel||null};
 });

 const invoiceRows=await Promise.all(invoices.map(async(invoice:FinanceInvoice)=>({invoice,state:await invoiceFinancialState(invoice)})));
 const refundRows=caseRefunds.map(r=>{
  const amountNumber=round(Number(r.amount));
  const paidNumber=round(r.installments.filter(i=>i.status==="PAID").reduce((s,i)=>s+Number(i.amount),0));
  return {...r,amountNumber,paidNumber,remainingNumber:round(Math.max(0,amountNumber-paidNumber))};
 });
 const expenseRows=expenses.map(e=>{
  const effectiveStatus=expenseEffectiveStatus(e);const paidNumber=round(expensePaidTotal(e));const remainingNumber=round(expenseRemaining(e));
  return {...e,effectiveStatus,paidNumber,remainingNumber};
 }).sort((a,b)=>new Date(b.updatedAt).getTime()-new Date(a.updatedAt).getTime());

 const byCurrency=new Map<string,CaseCurrencySummary>();
 const bucket=(currency:string)=>{const key=currency.toUpperCase();const found=byCurrency.get(key);if(found)return found;const v:CaseCurrencySummary={currency:key,grossDirectReceived:0,transferFees:0,netDirectReceived:0,appliedToCase:0,unappliedDirectFunds:0,billed:0,invoicePaid:0,receivable:0,approvedRefunds:0,refundsPaid:0,expensePaid:0,committedCost:0,pendingApprovalCost:0,realizedProfit:0,forecastProfit:0,realizedMarginPercent:null,forecastMarginPercent:null};byCurrency.set(key,v);return v;};

 for(const p of paymentRows){
  if(!["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"].includes(p.status))continue;
  const b=bucket(p.currency);
  if(p.directCasePayment){b.grossDirectReceived=round(b.grossDirectReceived+p.gross);b.transferFees=round(b.transferFees+p.fee);b.netDirectReceived=round(b.netDirectReceived+p.net);b.unappliedDirectFunds=round(b.unappliedDirectFunds+p.unapplied);}
  b.appliedToCase=round(b.appliedToCase+p.appliedToCase);
 }
 for(const row of invoiceRows){if(row.invoice.status==="CANCELLED")continue;const b=bucket(row.invoice.currency);b.billed=round(b.billed+row.invoice.total);b.invoicePaid=round(b.invoicePaid+row.state.paid);b.receivable=round(b.receivable+row.state.balance);}
 for(const r of refundRows){if(!["APPROVED","PARTIALLY_PAID","PAID"].includes(r.status))continue;const b=bucket(r.currency);b.approvedRefunds=round(b.approvedRefunds+r.amountNumber);b.refundsPaid=round(b.refundsPaid+r.paidNumber);}
 for(const e of expenseRows){if(["REJECTED","CANCELLED"].includes(e.effectiveStatus))continue;const b=bucket(e.currency);b.expensePaid=round(b.expensePaid+e.paidNumber);if(["APPROVED","PARTIALLY_PAID","PAID"].includes(e.effectiveStatus))b.committedCost=round(b.committedCost+e.amount);if(["DRAFT","SUBMITTED"].includes(e.effectiveStatus))b.pendingApprovalCost=round(b.pendingApprovalCost+e.amount);}
 for(const b of byCurrency.values()){
  // Realized service revenue follows money actually applied to this Case's invoices, not the client's entire wallet.
  const recognized=round(b.invoicePaid);
  b.realizedProfit=round(recognized-b.refundsPaid-b.expensePaid);
  b.forecastProfit=round(b.billed-b.approvedRefunds-b.committedCost);
  b.realizedMarginPercent=recognized>0?round((b.realizedProfit/recognized)*100):null;
  b.forecastMarginPercent=b.billed>0?round((b.forecastProfit/b.billed)*100):null;
 }
 return {
  case:c,
  summaries:[...byCurrency.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),
  payments:paymentRows,
  invoices:invoiceRows.sort((a,b)=>new Date(b.invoice.issueDate).getTime()-new Date(a.invoice.issueDate).getTime()),
  refunds:refundRows,
  expenses:expenseRows,
  alerts:{
   overallocatedPayments:paymentRows.filter(p=>p.overallocated>0),
   overdueInvoices:invoiceRows.filter(r=>r.state.overdue&&r.state.balance>0),
   pendingPayments:paymentRows.filter(p=>p.status==="PENDING"),
   pendingRefunds:refundRows.filter(r=>["REQUESTED","UNDER_REVIEW"].includes(r.status)),
   pendingExpenses:expenseRows.filter(e=>["DRAFT","SUBMITTED"].includes(e.effectiveStatus)),
  }
 };
}
