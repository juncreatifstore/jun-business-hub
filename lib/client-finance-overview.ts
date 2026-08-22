import "server-only";

import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { invoiceFinancialState, listInvoices, type FinanceInvoice } from "@/lib/finance-invoices";

function round(v:number){ return Math.round((v + Number.EPSILON) * 100) / 100; }

type CurrencySummary = {
  currency:string;
  grossReceived:number;
  fees:number;
  netReceived:number;
  appliedToInvoices:number;
  unappliedFunds:number;
  billed:number;
  invoicePaid:number;
  receivable:number;
  approvedRefunds:number;
  refundPaid:number;
};

export async function getClientFinanceOverview(clientId:string){
  const [payments, refunds, allInvoices] = await Promise.all([
    prisma.payment.findMany({
      where:{clientId},
      orderBy:[{paidAt:"desc"},{createdAt:"desc"}],
      select:{id:true,reference:true,amount:true,currency:true,status:true,method:true,provider:true,providerRef:true,paidAt:true,createdAt:true,caseId:true},
    }),
    prisma.refund.findMany({
      where:{clientId},
      orderBy:{createdAt:"desc"},
      include:{installments:{select:{amount:true,status:true,paidAt:true}}},
    }),
    listInvoices(5000),
  ]);
  const invoices = allInvoices.filter((i)=>i.clientId===clientId);
  const metaMap = await getPaymentCoreMetaMap(payments.map((p)=>p.id));

  const allocationByPayment = new Map<string,number>();
  for(const invoice of invoices){
    if(invoice.status==="CANCELLED") continue;
    for(const link of invoice.payments){
      allocationByPayment.set(link.paymentId, round((allocationByPayment.get(link.paymentId)||0)+Math.max(0,Number(link.amountApplied||0))));
    }
  }

  const paymentRows = payments.map((p)=>{
    const gross=round(Number(p.amount));
    const fee=round(Math.max(0,Number(metaMap.get(p.id)?.feeAmount||0)));
    const net=round(Math.max(0,gross-fee));
    const requestedAllocation=round(Math.max(0,allocationByPayment.get(p.id)||0));
    const applied=round(Math.min(net,requestedAllocation));
    const unapplied=round(Math.max(0,net-applied));
    const overallocated=round(Math.max(0,requestedAllocation-net));
    return {
      ...p,
      gross,fee,net,applied,unapplied,overallocated,
      serviceLabel:metaMap.get(p.id)?.serviceLabel||null,
    };
  });

  const invoiceRows = await Promise.all(invoices.map(async(invoice:FinanceInvoice)=>({invoice,state:await invoiceFinancialState(invoice)})));

  const byCurrency=new Map<string,CurrencySummary>();
  const bucket=(currency:string)=>{
    const key=currency.toUpperCase();
    const existing=byCurrency.get(key);
    if(existing) return existing;
    const value:CurrencySummary={currency:key,grossReceived:0,fees:0,netReceived:0,appliedToInvoices:0,unappliedFunds:0,billed:0,invoicePaid:0,receivable:0,approvedRefunds:0,refundPaid:0};
    byCurrency.set(key,value);return value;
  };

  for(const p of paymentRows){
    if(!["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"].includes(p.status)) continue;
    const b=bucket(p.currency);
    b.grossReceived=round(b.grossReceived+p.gross);
    b.fees=round(b.fees+p.fee);
    b.netReceived=round(b.netReceived+p.net);
    b.appliedToInvoices=round(b.appliedToInvoices+p.applied);
    b.unappliedFunds=round(b.unappliedFunds+p.unapplied);
  }

  for(const row of invoiceRows){
    if(row.invoice.status==="CANCELLED") continue;
    const b=bucket(row.invoice.currency);
    b.billed=round(b.billed+row.invoice.total);
    b.invoicePaid=round(b.invoicePaid+row.state.paid);
    b.receivable=round(b.receivable+row.state.balance);
  }

  const refundRows=refunds.map((r)=>{
    const amount=round(Number(r.amount));
    const paid=round(r.installments.filter((i)=>i.status==="PAID").reduce((s,i)=>s+Number(i.amount),0));
    if(["APPROVED","PARTIALLY_PAID","PAID"].includes(r.status)){
      const b=bucket(r.currency);
      b.approvedRefunds=round(b.approvedRefunds+amount);
      b.refundPaid=round(b.refundPaid+paid);
    }
    return {...r,amountNumber:amount,paidNumber:paid,remainingNumber:round(Math.max(0,amount-paid))};
  });

  return {
    summaries:[...byCurrency.values()].sort((a,b)=>a.currency.localeCompare(b.currency)),
    payments:paymentRows,
    invoices:invoiceRows.sort((a,b)=>new Date(b.invoice.issueDate).getTime()-new Date(a.invoice.issueDate).getTime()),
    refunds:refundRows,
    alerts:{
      overallocatedPayments:paymentRows.filter((p)=>p.overallocated>0),
      overdueInvoices:invoiceRows.filter((r)=>r.state.overdue&&r.state.balance>0),
      pendingPayments:paymentRows.filter((p)=>p.status==="PENDING"),
      pendingRefunds:refundRows.filter((r)=>["REQUESTED","UNDER_REVIEW"].includes(r.status)),
    },
  };
}
