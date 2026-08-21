"use server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { EXPENSE_CATEGORIES, canExpenseTransition, expensePaidTotal, expenseRemaining, getFinanceExpense, makeExpenseNumber, saveFinanceExpense, type ExpenseCategory, type ExpenseStatus, type FinanceExpense } from "@/lib/finance-expenses";

function money(v:FormDataEntryValue|null){ const n=Number(v); return Number.isFinite(n)?Math.round(n*100)/100:NaN; }
function text(v:FormDataEntryValue|null,max=3000){ return String(v||"").trim().slice(0,max); }

export async function createExpense(formData:FormData){
  const user=await assertPermission("EXPENSE_CREATE");
  const vendorName=text(formData.get("vendorName"),200); const amount=money(formData.get("amount")); const currency=text(formData.get("currency"),3).toUpperCase();
  const category=text(formData.get("category"),60) as ExpenseCategory; const description=text(formData.get("description"),3000);
  if(!vendorName||!Number.isFinite(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency)||!EXPENSE_CATEGORIES.includes(category)||!description) throw new Error("Invalid expense data");
  const clientId=text(formData.get("clientId"),80)||null; const caseId=text(formData.get("caseId"),80)||null;
  if(caseId){ const c=await prisma.case.findUnique({where:{id:caseId},select:{clientId:true}}); if(!c) throw new Error("Case not found"); if(clientId&&c.clientId!==clientId) throw new Error("Case belongs to a different client"); }
  const now=new Date().toISOString(); const id=randomUUID();
  const expense:FinanceExpense={ id, expenseNumber:makeExpenseNumber(), vendorName, vendorCountry:text(formData.get("vendorCountry"),120), category, description, invoiceNumber:text(formData.get("invoiceNumber"),120), amount, currency, dueDate:text(formData.get("dueDate"),20)||null, status:"DRAFT", caseId, clientId, invoiceFileId:text(formData.get("invoiceFileId"),80)||null, createdById:user.id, approvedById:null, decisionNote:"", payments:[], createdAt:now, updatedAt:now };
  await saveFinanceExpense(expense); await audit({userId:user.id,action:"EXPENSE_CREATE",resourceType:"Expense",resourceId:id,after:{expenseNumber:expense.expenseNumber,vendorName,amount,currency,category}});
  await logActivity({userId:user.id,type:"FINANCE_EXPENSE_CREATED",message:`Created expense ${expense.expenseNumber} for ${vendorName}`});
  revalidatePath("/app/finance/expenses"); redirect(`/app/finance/expenses/${id}`);
}

export async function transitionExpense(id:string,status:ExpenseStatus,formData?:FormData){
  const user=await assertPermission(status==="SUBMITTED"?"EXPENSE_CREATE":"EXPENSE_APPROVE"); const e=await getFinanceExpense(id); if(!e) throw new Error("Expense not found");
  if(!canExpenseTransition(e.status,status)) throw new Error(`Invalid transition ${e.status} -> ${status}`);
  if(status==="CANCELLED"&&expensePaidTotal(e)>0) throw new Error("A partially paid expense cannot be cancelled");
  const next:FinanceExpense={...e,status,approvedById:status==="APPROVED"?user.id:e.approvedById,decisionNote:text(formData?.get("decisionNote")||null,3000)||e.decisionNote,updatedAt:new Date().toISOString()};
  await saveFinanceExpense(next); await audit({userId:user.id,action:`EXPENSE_${status}`,resourceType:"Expense",resourceId:id,before:{status:e.status},after:{status,decisionNote:next.decisionNote}}); revalidatePath(`/app/finance/expenses/${id}`); revalidatePath("/app/finance/expenses"); revalidatePath("/app/finance");
}

export async function recordExpensePayment(id:string,formData:FormData){
  const user=await assertPermission("EXPENSE_APPROVE"); const e=await getFinanceExpense(id); if(!e) throw new Error("Expense not found"); if(!["APPROVED","PARTIALLY_PAID"].includes(e.status)) throw new Error("Expense must be approved before payment");
  const amount=money(formData.get("amount")); const remaining=expenseRemaining(e); const method=text(formData.get("method"),80); const transactionRef=text(formData.get("transactionRef"),180); const proofFileId=text(formData.get("proofFileId"),80)||null;
  if(!Number.isFinite(amount)||amount<=0||amount>remaining) throw new Error("Payment amount exceeds remaining balance"); if(!method||!transactionRef) throw new Error("Method and transaction reference are required");
  if(proofFileId){ const f=await prisma.file.findUnique({where:{id:proofFileId},select:{id:true}}); if(!f) throw new Error("Proof file not found"); }
  const payment={id:randomUUID(),amount,paidAt:new Date().toISOString(),method,transactionRef,proofFileId,note:text(formData.get("note"),2000),recordedById:user.id}; const payments=[...e.payments,payment]; const total=Math.round(payments.reduce((s,p)=>s+p.amount,0)*100)/100; const status:ExpenseStatus=total>=e.amount?"PAID":"PARTIALLY_PAID";
  const next:FinanceExpense={...e,payments,status,updatedAt:new Date().toISOString()}; await saveFinanceExpense(next); await audit({userId:user.id,action:"EXPENSE_PAYMENT_RECORDED",resourceType:"Expense",resourceId:id,after:{paymentId:payment.id,amount,currency:e.currency,method,transactionRef,status}}); await logActivity({userId:user.id,type:"FINANCE_EXPENSE_PAID",message:`Recorded ${e.currency} ${amount.toFixed(2)} on ${e.expenseNumber}`}); revalidatePath(`/app/finance/expenses/${id}`); revalidatePath("/app/finance/expenses"); revalidatePath("/app/finance");
}
