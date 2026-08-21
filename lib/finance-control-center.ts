import "server-only";

import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { getFinancePaymentAccounts } from "@/lib/finance-payment-accounts";
import { listOnlinePaymentSessions } from "@/lib/finance-online-payments";
import { getManualTransferOrders } from "@/lib/finance-manual-transfers";
import { isInstallmentOverdue } from "@/lib/finance-refund-installments";
import { listFinanceExpenses, expenseEffectiveStatus, expenseIsOverdue, expensePaidTotal, expenseRemaining } from "@/lib/finance-expenses";

export type CurrencySnapshot = { currency:string; collected:number; fees:number; refundsPaid:number; expensesPaid:number; netCash:number; paymentCount:number };
function round(value:number){return Math.round(value*100)/100}
function add(map:Map<string,CurrencySnapshot>,currency:string,field:keyof Omit<CurrencySnapshot,"currency">,value:number){const code=String(currency||"USD").toUpperCase();const row=map.get(code)||{currency:code,collected:0,fees:0,refundsPaid:0,expensesPaid:0,netCash:0,paymentCount:0};(row[field] as number)=round((row[field] as number)+value);map.set(code,row)}

export async function getFinanceControlCenter(){
  const now=new Date(); const yearStart=new Date(now.getFullYear(),0,1); const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const [payments,refunds,accounts,onlineSessions,manualOrders,expenses]=await Promise.all([
    prisma.payment.findMany({where:{status:{in:["PENDING","CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}},orderBy:{createdAt:"desc"},take:1000,include:{client:{select:{firstName:true,lastName:true}},files:{where:{archivedAt:null,category:"PAYMENT_PROOF"},select:{id:true}}}}),
    prisma.refund.findMany({where:{status:{notIn:["REJECTED","CANCELLED"]}},orderBy:{createdAt:"desc"},take:500,include:{client:{select:{firstName:true,lastName:true}},installments:{orderBy:{dueDate:"asc"}}}}),
    getFinancePaymentAccounts(), listOnlinePaymentSessions(300), getManualTransferOrders(), listFinanceExpenses(500)
  ]);
  const confirmedPayments=payments.filter(p=>["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"].includes(p.status)); const metaMap=await getPaymentCoreMetaMap(confirmedPayments.map(p=>p.id)); const currencyMap=new Map<string,CurrencySnapshot>();
  for(const p of confirmedPayments){add(currencyMap,p.currency,"collected",Number(p.amount));add(currencyMap,p.currency,"paymentCount",1);add(currencyMap,p.currency,"fees",Number(metaMap.get(p.id)?.feeAmount||0))}
  for(const r of refunds)for(const i of r.installments)if(i.status==="PAID")add(currencyMap,r.currency,"refundsPaid",Number(i.amount));
  for(const e of expenses)for(const p of e.payments)add(currencyMap,e.currency,"expensesPaid",p.amount);
  for(const row of currencyMap.values())row.netCash=round(row.collected-row.fees-row.refundsPaid-row.expensesPaid);

  const monthCurrencies=new Map<string,{collected:number;refunds:number;expenses:number;net:number}>();
  for(const p of confirmedPayments.filter(p=>(p.paidAt||p.createdAt)>=monthStart)){const c=p.currency.toUpperCase();const row=monthCurrencies.get(c)||{collected:0,refunds:0,expenses:0,net:0};row.collected=round(row.collected+Number(p.amount)-Number(metaMap.get(p.id)?.feeAmount||0));monthCurrencies.set(c,row)}
  for(const r of refunds)for(const i of r.installments)if(i.status==="PAID"&&i.paidAt&&i.paidAt>=monthStart){const c=r.currency.toUpperCase();const row=monthCurrencies.get(c)||{collected:0,refunds:0,expenses:0,net:0};row.refunds=round(row.refunds+Number(i.amount));monthCurrencies.set(c,row)}
  for(const e of expenses)for(const p of e.payments)if(new Date(p.paidAt)>=monthStart){const c=e.currency.toUpperCase();const row=monthCurrencies.get(c)||{collected:0,refunds:0,expenses:0,net:0};row.expenses=round(row.expenses+p.amount);monthCurrencies.set(c,row)}
  for(const row of monthCurrencies.values())row.net=round(row.collected-row.refunds-row.expenses);

  const allInstallments=refunds.flatMap(refund=>refund.installments.map(installment=>({refund,installment}))); const overdueInstallments=allInstallments.filter(({installment})=>isInstallmentOverdue(installment.status,installment.dueDate,now)); const upcomingInstallments=allInstallments.filter(({installment})=>installment.status==="SCHEDULED"&&iFuture(installment.dueDate,now)).sort((a,b)=>a.installment.dueDate.getTime()-b.installment.dueDate.getTime()).slice(0,8);
  const pendingPayments=payments.filter(p=>p.status==="PENDING"); const onlinePaymentIds=new Set(onlineSessions.filter(s=>s.status==="PAID").map(s=>s.paymentId)); const missingPaymentProof=confirmedPayments.filter(p=>p.files.length===0&&!onlinePaymentIds.has(p.id)); const refundsToReview=refunds.filter(r=>["REQUESTED","UNDER_REVIEW"].includes(r.status)); const onlineAttention=onlineSessions.filter(s=>["FAILED","EXPIRED"].includes(s.status)); const manualOpen=manualOrders.filter(o=>["DRAFT","ISSUED"].includes(o.status));
  const expenseOpen=expenses.filter(e=>["SUBMITTED","APPROVED","PARTIALLY_PAID"].includes(expenseEffectiveStatus(e))); const expenseOverdue=expenses.filter(e=>expenseIsOverdue(e,now));
  const apByCurrency=new Map<string,{outstanding:number;overdue:number;count:number}>(); for(const e of expenseOpen){const c=e.currency.toUpperCase();const row=apByCurrency.get(c)||{outstanding:0,overdue:0,count:0};row.outstanding=round(row.outstanding+expenseRemaining(e));row.count++;if(expenseIsOverdue(e,now))row.overdue=round(row.overdue+expenseRemaining(e));apByCurrency.set(c,row)}
  const methodMap=new Map<string,{count:number;amountByCurrency:Record<string,number>}>(); for(const p of confirmedPayments){const row=methodMap.get(p.method)||{count:0,amountByCurrency:{}};row.count+=1;row.amountByCurrency[p.currency]=round((row.amountByCurrency[p.currency]||0)+Number(p.amount));methodMap.set(p.method,row)}
  return {generatedAt:now,year:now.getFullYear(),ytdPaymentCount:confirmedPayments.filter(p=>(p.paidAt||p.createdAt)>=yearStart).length,currencies:[...currencyMap.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),monthCurrencies:[...monthCurrencies.entries()].map(([currency,values])=>({currency,...values})).sort((a,b)=>a.currency.localeCompare(b.currency)),methods:[...methodMap.entries()].map(([method,values])=>({method,...values})).sort((a,b)=>b.count-a.count),accounts:{total:accounts.length,active:accounts.filter(a=>a.enabled).length},online:{total:onlineSessions.length,paid:onlineSessions.filter(s=>s.status==="PAID").length,pending:onlineSessions.filter(s=>["CREATED","PENDING"].includes(s.status)).length,attention:onlineAttention.length},manual:{total:manualOrders.length,open:manualOpen.length,completed:manualOrders.filter(o=>o.status==="COMPLETED").length},expenses:{total:expenses.length,open:expenseOpen.length,overdue:expenseOverdue.length,paid:expenses.filter(e=>expenseEffectiveStatus(e)==="PAID").length,apByCurrency:[...apByCurrency.entries()].map(([currency,v])=>({currency,...v}))},alerts:{pendingPayments:pendingPayments.slice(0,8),missingPaymentProof:missingPaymentProof.slice(0,8),refundsToReview:refundsToReview.slice(0,8),overdueInstallments:overdueInstallments.slice(0,8),onlineAttention:onlineAttention.slice(0,8),manualOpen:manualOpen.slice(0,8),expenseOverdue:expenseOverdue.slice(0,8),counts:{pendingPayments:pendingPayments.length,missingPaymentProof:missingPaymentProof.length,refundsToReview:refundsToReview.length,overdueInstallments:overdueInstallments.length,onlineAttention:onlineAttention.length,manualOpen:manualOpen.length,expenseOverdue:expenseOverdue.length}},upcomingInstallments};
}
function iFuture(date:Date,now:Date){return date.getTime()>=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()}
