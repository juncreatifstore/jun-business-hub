import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const EXPENSE_PREFIX = "finance.expense.";

export type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "REJECTED" | "CANCELLED";
export type ExpenseCategory = "AIRFARE" | "HOTEL" | "VISA_FEES" | "MARKETING" | "SOFTWARE" | "OFFICE" | "PAYROLL" | "PROFESSIONAL_SERVICES" | "BANK_FEES" | "TAXES" | "TRANSPORT" | "UTILITIES" | "REFUNDS_COST" | "OTHER";

export type ExpensePayment = {
  id: string;
  amount: number;
  paidAt: string;
  method: string;
  transactionRef: string;
  proofFileId: string | null;
  note: string;
  recordedById: string;
};

export type FinanceExpense = {
  id: string;
  expenseNumber: string;
  vendorName: string;
  vendorCountry: string;
  category: ExpenseCategory;
  description: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  status: ExpenseStatus;
  caseId: string | null;
  clientId: string | null;
  invoiceFileId: string | null;
  createdById: string;
  approvedById: string | null;
  decisionNote: string;
  payments: ExpensePayment[];
  createdAt: string;
  updatedAt: string;
};

const STATUS_ORDER: ExpenseStatus[] = ["DRAFT","SUBMITTED","APPROVED","PARTIALLY_PAID","PAID","REJECTED","CANCELLED"];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["AIRFARE","HOTEL","VISA_FEES","MARKETING","SOFTWARE","OFFICE","PAYROLL","PROFESSIONAL_SERVICES","BANK_FEES","TAXES","TRANSPORT","UTILITIES","REFUNDS_COST","OTHER"];

function round(v:number){ return Math.round(v*100)/100; }
function key(id:string){ return `${EXPENSE_PREFIX}${id}`; }
function parse(value:string): FinanceExpense | null {
  try {
    const e = JSON.parse(value) as FinanceExpense;
    if (!e?.id || !e.expenseNumber || !e.vendorName) return null;
    return { ...e, amount: round(Number(e.amount||0)), currency: String(e.currency||"USD").toUpperCase(), payments: Array.isArray(e.payments) ? e.payments : [] };
  } catch { return null; }
}
export function makeExpenseNumber(){ return `EXP-${new Date().getFullYear()}-${randomUUID().slice(0,8).toUpperCase()}`; }
export async function listFinanceExpenses(limit=500){
  const rows=await prisma.appSetting.findMany({where:{key:{startsWith:EXPENSE_PREFIX}},orderBy:{updatedAt:"desc"},take:limit,select:{value:true}});
  return rows.map(r=>parse(r.value)).filter((v):v is FinanceExpense=>Boolean(v));
}
export async function getFinanceExpense(id:string){ const row=await prisma.appSetting.findUnique({where:{key:key(id)},select:{value:true}}); return row?parse(row.value):null; }
export async function saveFinanceExpense(expense:FinanceExpense){ const value=JSON.stringify(expense); await prisma.appSetting.upsert({where:{key:key(expense.id)},create:{key:key(expense.id),value},update:{value}}); return expense; }
export async function mutateFinanceExpense<T>(id:string,mutate:(current:FinanceExpense)=>{expense:FinanceExpense;result:T}|Promise<{expense:FinanceExpense;result:T}>):Promise<T>{
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance-expense:${id}`}))`;
    const row=await tx.appSetting.findUnique({where:{key:key(id)},select:{value:true}});
    const current=row?parse(row.value):null;
    if(!current)throw new Error("Expense not found");
    const {expense,result}=await mutate(current);
    if(expense.id!==id)throw new Error("Expense mutation cannot change the expense id");
    expense.updatedAt=new Date().toISOString();
    await tx.appSetting.update({where:{key:key(id)},data:{value:JSON.stringify(expense)}});
    return result;
  },{isolationLevel:"Serializable"});
}
export function expensePaidTotal(e:FinanceExpense){ return round(e.payments.reduce((s,p)=>s+Number(p.amount||0),0)); }
export function expenseRemaining(e:FinanceExpense){ return Math.max(0,round(e.amount-expensePaidTotal(e))); }
export function expenseEffectiveStatus(e:FinanceExpense): ExpenseStatus {
  const paid=expensePaidTotal(e); if (paid>=e.amount && e.amount>0) return "PAID"; if (paid>0) return "PARTIALLY_PAID"; return e.status;
}
export function expenseIsOverdue(e:FinanceExpense, now=new Date()){ if(!e.dueDate || ["PAID","REJECTED","CANCELLED"].includes(expenseEffectiveStatus(e))) return false; return new Date(e.dueDate).getTime()<new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime(); }
export function canExpenseTransition(from:ExpenseStatus,to:ExpenseStatus){
  const map:Record<ExpenseStatus,ExpenseStatus[]>={DRAFT:["SUBMITTED","CANCELLED"],SUBMITTED:["APPROVED","REJECTED","CANCELLED"],APPROVED:["PARTIALLY_PAID","PAID","CANCELLED"],PARTIALLY_PAID:["PARTIALLY_PAID","PAID"],PAID:[],REJECTED:[],CANCELLED:[]};
  return map[from]?.includes(to)??false;
}
export function expenseStatusRank(status:ExpenseStatus){ return STATUS_ORDER.indexOf(status); }
