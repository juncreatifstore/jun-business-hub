import "server-only";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { listFinanceExpenses, expenseEffectiveStatus } from "@/lib/finance-expenses";

const ENTRY_PREFIX = "finance.accounting.entry.";
const CLOSE_PREFIX = "finance.accounting.close.";

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | "CONTRA_REVENUE";
export type LedgerSource = "PAYMENT" | "REFUND" | "EXPENSE" | "EXPENSE_PAYMENT" | "ADJUSTMENT";
export type LedgerLine = { accountCode:string; accountName:string; debit:number; credit:number };
export type JournalEntry = {
  id:string; entryNumber:string; date:string; currency:string; description:string;
  sourceType:LedgerSource; sourceId:string; sourceHref:string|null; lines:LedgerLine[];
  createdAt:string; createdById:string|null; hash:string;
};
export type AccountingPeriodClose = { period:string; closedAt:string; closedById:string; note:string };

export const CHART_OF_ACCOUNTS = [
  { code:"1000", name:"Cash & Payment Accounts", type:"ASSET" as const },
  { code:"2000", name:"Accounts Payable", type:"LIABILITY" as const },
  { code:"3000", name:"Owner Equity / Retained Earnings", type:"EQUITY" as const },
  { code:"4000", name:"Service Revenue", type:"REVENUE" as const },
  { code:"4090", name:"Refunds & Sales Returns", type:"CONTRA_REVENUE" as const },
  { code:"5100", name:"Airfare Expense", type:"EXPENSE" as const },
  { code:"5110", name:"Hotel Expense", type:"EXPENSE" as const },
  { code:"5120", name:"Visa Fees Expense", type:"EXPENSE" as const },
  { code:"5200", name:"Marketing Expense", type:"EXPENSE" as const },
  { code:"5210", name:"Software Expense", type:"EXPENSE" as const },
  { code:"5220", name:"Office Expense", type:"EXPENSE" as const },
  { code:"5230", name:"Payroll Expense", type:"EXPENSE" as const },
  { code:"5240", name:"Professional Services", type:"EXPENSE" as const },
  { code:"5250", name:"Payment & Bank Fees", type:"EXPENSE" as const },
  { code:"5260", name:"Taxes Expense", type:"EXPENSE" as const },
  { code:"5270", name:"Transport Expense", type:"EXPENSE" as const },
  { code:"5280", name:"Utilities Expense", type:"EXPENSE" as const },
  { code:"5290", name:"Other Operating Expense", type:"EXPENSE" as const },
];

const EXPENSE_ACCOUNT:Record<string,string>={AIRFARE:"5100",HOTEL:"5110",VISA_FEES:"5120",MARKETING:"5200",SOFTWARE:"5210",OFFICE:"5220",PAYROLL:"5230",PROFESSIONAL_SERVICES:"5240",BANK_FEES:"5250",TAXES:"5260",TRANSPORT:"5270",UTILITIES:"5280",REFUNDS_COST:"5290",OTHER:"5290"};
function round(v:number){return Math.round(v*100)/100;}
function account(code:string){const a=CHART_OF_ACCOUNTS.find(x=>x.code===code);if(!a)throw new Error(`Unknown account ${code}`);return a;}
function periodOf(date:Date|string){const d=new Date(date);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;}
function sourceKey(type:LedgerSource,id:string){return `${ENTRY_PREFIX}${type.toLowerCase()}.${id}`;}
function entryHash(input:Omit<JournalEntry,"hash">){return createHash("sha256").update(JSON.stringify(input)).digest("hex");}
function balanced(lines:LedgerLine[]){const d=round(lines.reduce((s,l)=>s+l.debit,0));const c=round(lines.reduce((s,l)=>s+l.credit,0));return d===c && d>0;}
function line(code:string,debit=0,credit=0):LedgerLine{const a=account(code);return{accountCode:code,accountName:a.name,debit:round(debit),credit:round(credit)};}

export async function listJournalEntries(limit=2500){
  const rows=await prisma.appSetting.findMany({where:{key:{startsWith:ENTRY_PREFIX}},orderBy:{updatedAt:"desc"},take:limit,select:{value:true}});
  return rows.map(r=>{try{return JSON.parse(r.value) as JournalEntry}catch{return null}}).filter((v):v is JournalEntry=>Boolean(v?.id&&v.lines?.length));
}
export async function getClosedPeriods(){
  const rows=await prisma.appSetting.findMany({where:{key:{startsWith:CLOSE_PREFIX}},select:{value:true}});
  return rows.map(r=>{try{return JSON.parse(r.value) as AccountingPeriodClose}catch{return null}}).filter((v):v is AccountingPeriodClose=>Boolean(v?.period));
}
export async function isPeriodClosed(date:Date|string){const p=periodOf(date);return Boolean(await prisma.appSetting.findUnique({where:{key:`${CLOSE_PREFIX}${p}`},select:{key:true}}));}

async function persistEntry(input:Omit<JournalEntry,"id"|"entryNumber"|"createdAt"|"hash">){
  if(!balanced(input.lines)) throw new Error("Accounting entry is not balanced");
  const key=sourceKey(input.sourceType,input.sourceId);
  const existing=await prisma.appSetting.findUnique({where:{key},select:{value:true}});
  if(existing){try{return JSON.parse(existing.value) as JournalEntry}catch{throw new Error("Existing accounting entry is unreadable");}}
  if(await isPeriodClosed(input.date)) throw new Error(`Accounting period ${periodOf(input.date)} is closed`);
  const now=new Date().toISOString();
  const base={...input,id:randomUUID(),entryNumber:`JE-${new Date(input.date).getUTCFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`,createdAt:now};
  const entry:JournalEntry={...base,hash:entryHash(base)};
  await prisma.appSetting.create({data:{key,value:JSON.stringify(entry)}});
  return entry;
}

export async function syncAccountingLedger(createdById:string|null=null){
  const [payments,refunds,expenses]=await Promise.all([
    prisma.payment.findMany({where:{status:{in:["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}},select:{id:true,reference:true,amount:true,currency:true,paidAt:true,createdAt:true}}),
    prisma.refund.findMany({where:{status:{notIn:["REJECTED","CANCELLED"]}},select:{id:true,refundNumber:true,currency:true,installments:{where:{status:"PAID"},select:{id:true,number:true,amount:true,paidAt:true,dueDate:true}}}}),
    listFinanceExpenses(2000),
  ]);
  const meta=await getPaymentCoreMetaMap(payments.map(p=>p.id));
  let created=0,skipped=0,closed=0;
  const post=async(input:Omit<JournalEntry,"id"|"entryNumber"|"createdAt"|"hash">)=>{try{const existed=await prisma.appSetting.findUnique({where:{key:sourceKey(input.sourceType,input.sourceId)},select:{key:true}});if(existed){skipped++;return;}await persistEntry(input);created++;}catch(e){if(String(e).includes("is closed")){closed++;return;}throw e;}};
  for(const p of payments){
    const amount=Number(p.amount), fee=round(Number(meta.get(p.id)?.feeAmount||0)), cash=round(amount-fee), date=(p.paidAt||p.createdAt).toISOString();
    await post({date,currency:p.currency,description:`Payment ${p.reference}`,sourceType:"PAYMENT",sourceId:p.id,sourceHref:`/app/finance/payments/${p.id}`,createdById,lines:[line("1000",cash,0),...(fee>0?[line("5250",fee,0)]:[]),line("4000",0,amount)]});
  }
  for(const r of refunds) for(const i of r.installments){const amount=Number(i.amount),date=(i.paidAt||i.dueDate).toISOString();await post({date,currency:r.currency,description:`Refund ${r.refundNumber} installment #${i.number}`,sourceType:"REFUND",sourceId:i.id,sourceHref:`/app/finance/refunds/${r.id}`,createdById,lines:[line("4090",amount,0),line("1000",0,amount)]});}
  for(const e of expenses){
    const status=expenseEffectiveStatus(e);
    if(["APPROVED","PARTIALLY_PAID","PAID"].includes(status)){
      const code=EXPENSE_ACCOUNT[e.category]||"5290";
      await post({date:e.createdAt,currency:e.currency,description:`Vendor bill ${e.expenseNumber} · ${e.vendorName}`,sourceType:"EXPENSE",sourceId:e.id,sourceHref:`/app/finance/expenses/${e.id}`,createdById,lines:[line(code,e.amount,0),line("2000",0,e.amount)]});
    }
    for(const p of e.payments) await post({date:p.paidAt,currency:e.currency,description:`Vendor payment ${e.expenseNumber} · ${e.vendorName}`,sourceType:"EXPENSE_PAYMENT",sourceId:p.id,sourceHref:`/app/finance/expenses/${e.id}`,createdById,lines:[line("2000",p.amount,0),line("1000",0,p.amount)]});
  }
  return {created,skipped,closed};
}

export async function closeAccountingPeriod(period:string,closedById:string,note:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Invalid period");
  const close:AccountingPeriodClose={period,closedAt:new Date().toISOString(),closedById,note:note.trim().slice(0,500)};
  await prisma.appSetting.upsert({where:{key:`${CLOSE_PREFIX}${period}`},create:{key:`${CLOSE_PREFIX}${period}`,value:JSON.stringify(close)},update:{value:JSON.stringify(close)}});
  return close;
}

export async function getAccountingStatements(from:Date,to:Date){
  const entries=(await listJournalEntries(5000)).filter(e=>{const d=new Date(e.date);return d>=from&&d<=to;});
  const byCurrency=new Map<string,{revenue:number;refunds:number;expenses:number;netIncome:number;cashMovement:number}>();
  for(const e of entries){const row=byCurrency.get(e.currency)||{revenue:0,refunds:0,expenses:0,netIncome:0,cashMovement:0};for(const l of e.lines){const a=account(l.accountCode);if(a.type==="REVENUE")row.revenue+=l.credit-l.debit;else if(a.type==="CONTRA_REVENUE")row.refunds+=l.debit-l.credit;else if(a.type==="EXPENSE")row.expenses+=l.debit-l.credit;if(l.accountCode==="1000")row.cashMovement+=l.debit-l.credit;}row.revenue=round(row.revenue);row.refunds=round(row.refunds);row.expenses=round(row.expenses);row.cashMovement=round(row.cashMovement);row.netIncome=round(row.revenue-row.refunds-row.expenses);byCurrency.set(e.currency,row);}
  const trial=new Map<string,Record<string,{debit:number;credit:number;balance:number;name:string}>>();
  for(const e of entries){const cur=trial.get(e.currency)||{};for(const l of e.lines){const r=cur[l.accountCode]||{debit:0,credit:0,balance:0,name:l.accountName};r.debit=round(r.debit+l.debit);r.credit=round(r.credit+l.credit);r.balance=round(r.debit-r.credit);cur[l.accountCode]=r;}trial.set(e.currency,cur);}
  return {entries,profitLoss:[...byCurrency.entries()].map(([currency,v])=>({currency,...v})),trialBalance:[...trial.entries()].map(([currency,accounts])=>({currency,accounts:Object.entries(accounts).map(([code,v])=>({code,...v})).sort((a,b)=>a.code.localeCompare(b.code))}))};
}

export async function getBalanceSheet(asOf:Date){
  const entries=(await listJournalEntries(5000)).filter(e=>new Date(e.date)<=asOf);
  const byCurrency=new Map<string,Record<string,number>>();
  for(const e of entries){const cur=byCurrency.get(e.currency)||{};for(const l of e.lines)cur[l.accountCode]=round((cur[l.accountCode]||0)+l.debit-l.credit);byCurrency.set(e.currency,cur);}
  return [...byCurrency.entries()].map(([currency,balances])=>{
    const cash=round(balances["1000"]||0);
    const accountsPayable=round(-(balances["2000"]||0));
    const revenue=round(-(balances["4000"]||0));
    const refunds=round(balances["4090"]||0);
    const expenses=round(Object.entries(balances).filter(([code])=>code.startsWith("5")).reduce((s,[,v])=>s+v,0));
    const retainedEarnings=round(revenue-refunds-expenses);
    return {currency,cash,accountsPayable,retainedEarnings,totalAssets:cash,totalLiabilitiesAndEquity:round(accountsPayable+retainedEarnings)};
  }).sort((a,b)=>a.currency.localeCompare(b.currency));
}
