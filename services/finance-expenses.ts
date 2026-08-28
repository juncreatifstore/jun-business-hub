"use server";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getClientBlock } from "@/lib/client-transaction-block";
import { ensureFinancialAuthorization } from "@/lib/company-funds-approvals";
import { createFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";
import { ensureUniversalFinancialReceipt } from "@/lib/finance-universal-receipts";
import { EXPENSE_CATEGORIES, canExpenseTransition, expensePaidTotal, expenseRemaining, getFinanceExpense, makeExpenseNumber, mutateFinanceExpense, saveFinanceExpense, type ExpenseCategory, type ExpenseStatus, type FinanceExpense } from "@/lib/finance-expenses";

function money(v:FormDataEntryValue|null){ const n=Number(v); return Number.isFinite(n)?Math.round(n*100)/100:NaN; }
function text(v:FormDataEntryValue|null,max=3000){ return String(v||"").trim().slice(0,max); }

export async function createExpense(formData:FormData){
  const user=await assertPermission("EXPENSE_CREATE");
  const vendorName=text(formData.get("vendorName"),200); const amount=money(formData.get("amount")); const currency=text(formData.get("currency"),3).toUpperCase();
  const category=text(formData.get("category"),60) as ExpenseCategory; const description=text(formData.get("description"),3000);
  if(!vendorName||!Number.isFinite(amount)||amount<=0||!/^[A-Z]{3}$/.test(currency)||!EXPENSE_CATEGORIES.includes(category)||!description) throw new Error("Invalid expense data");
  const clientId=text(formData.get("clientId"),80)||null; const caseId=text(formData.get("caseId"),80)||null;
  if(clientId){ const block=await getClientBlock(clientId); if(block?.blocked) throw new Error(`Client blocked: ${block.reason}`); }
  if(caseId){ const c=await prisma.case.findUnique({where:{id:caseId},select:{clientId:true}}); if(!c) throw new Error("Case not found"); if(clientId&&c.clientId!==clientId) throw new Error("Case belongs to a different client"); const block=await getClientBlock(c.clientId); if(block?.blocked) throw new Error(`Client blocked: ${block.reason}`); }
  const now=new Date().toISOString(); const id=randomUUID();
  const expense:FinanceExpense={ id, expenseNumber:makeExpenseNumber(), vendorName, vendorCountry:text(formData.get("vendorCountry"),120), category, description, invoiceNumber:text(formData.get("invoiceNumber"),120), amount, currency, dueDate:text(formData.get("dueDate"),20)||null, status:"DRAFT", caseId, clientId, invoiceFileId:text(formData.get("invoiceFileId"),80)||null, createdById:user.id, approvedById:null, decisionNote:"", payments:[], createdAt:now, updatedAt:now };
  await saveFinanceExpense(expense); await audit({userId:user.id,action:"EXPENSE_CREATE",resourceType:"Expense",resourceId:id,after:{expenseNumber:expense.expenseNumber,vendorName,amount,currency,category}});
  await logActivity({userId:user.id,type:"FINANCE_EXPENSE_CREATED",message:`Created expense ${expense.expenseNumber} for ${vendorName}`,clientId:clientId||undefined,caseId:caseId||undefined});
  revalidatePath("/app/finance/expenses"); redirect(`/app/finance/expenses/${id}`);
}

export async function transitionExpense(id:string,status:ExpenseStatus,formData?:FormData){
  const user=await assertPermission(status==="SUBMITTED"?"EXPENSE_CREATE":"EXPENSE_APPROVE"); const initial=await getFinanceExpense(id); if(!initial) throw new Error("Expense not found");
  if(initial.clientId&&!['CANCELLED','REJECTED'].includes(status)){ const block=await getClientBlock(initial.clientId); if(block?.blocked) throw new Error(`Client blocked: ${block.reason}`); }
  const outcome=await mutateFinanceExpense(id,current=>{
    if(current.status===status)return{expense:current,result:{duplicate:true,before:current.status,next:current}};
    if(!canExpenseTransition(current.status,status)) throw new Error(`Invalid transition ${current.status} -> ${status}`);
    if(status==="CANCELLED"&&expensePaidTotal(current)>0) throw new Error("A partially paid expense cannot be cancelled");
    const next:FinanceExpense={...current,status,approvedById:status==="APPROVED"?user.id:current.approvedById,decisionNote:text(formData?.get("decisionNote")||null,3000)||current.decisionNote};
    return{expense:next,result:{duplicate:false,before:current.status,next}};
  });
  if(!outcome.duplicate)await audit({userId:user.id,action:`EXPENSE_${status}`,resourceType:"Expense",resourceId:id,before:{status:outcome.before},after:{status,decisionNote:outcome.next.decisionNote}});
  revalidatePath(`/app/finance/expenses/${id}`); revalidatePath("/app/finance/expenses"); revalidatePath("/app/finance");
}

export async function recordExpensePayment(id:string,formData:FormData){
  const user=await assertPermission("EXPENSE_APPROVE");
  const e=await getFinanceExpense(id); if(!e) throw new Error("Expense not found");
  const amount=money(formData.get("amount"));
  const method=text(formData.get("method"),80);
  const transactionRef=text(formData.get("transactionRef"),180);
  const proofFileId=text(formData.get("proofFileId"),80);

  if(transactionRef){
    const existing=e.payments.find(p=>p.transactionRef===transactionRef);
    if(existing){
      if(Number.isFinite(amount)&&Math.abs(existing.amount-amount)>=0.005) throw new Error(`Transaction reference ${transactionRef} is already recorded with a different amount.`);
      revalidatePath(`/app/finance/expenses/${id}`);
      return;
    }
  }

  if(e.clientId){ const block=await getClientBlock(e.clientId); if(block?.blocked) throw new Error(`Client blocked: ${block.reason}`); }
  if(!["APPROVED","PARTIALLY_PAID"].includes(e.status)) throw new Error("Expense must be approved before payment");
  const remaining=expenseRemaining(e);
  if(!Number.isFinite(amount)||amount<=0||amount>remaining) throw new Error("Payment amount exceeds remaining balance");
  if(!method||!transactionRef||!proofFileId) throw new Error("Method, transaction reference and execution proof are required");
  const f=await prisma.file.findUnique({where:{id:proofFileId},select:{id:true}}); if(!f) throw new Error("Proof file not found");

  const paidBefore=expensePaidTotal(e); const authorizationResourceId=`${e.id}:${paidBefore.toFixed(2)}:${amount.toFixed(2)}`;
  const authorization=await ensureFinancialAuthorization({type:"EXPENSE",resourceId:authorizationResourceId,reference:e.expenseNumber,description:`Paiement dépense · ${e.vendorName} · ${e.description}`,amount,currency:e.currency,requestedById:user.id});
  if(authorization.status!=="APPROVED"){
    await audit({userId:user.id,action:"EXPENSE_PAYMENT_AUTHORIZATION_REQUIRED",resourceType:"Expense",resourceId:e.id,after:{authorizationId:authorization.id,amount,currency:e.currency,requiredApprovals:authorization.requiredApprovals,reserveImpact:authorization.reserveImpact}});
    revalidatePath("/app/company-funds/authorizations");
    throw new Error(`Autorisation financière requise avant paiement (${authorization.reference}).`);
  }

  const paidAt=new Date(); await assertFinancialPeriodOpen(paidAt); const paidAtIso=paidAt.toISOString();
  await createFinancialExecutionEvidence({authorizationId:authorization.id,transactionReference:transactionRef,proofFileId,note:`${method} · ${text(formData.get("note"),1000)}`,executedById:user.id,executedAt:paidAtIso});

  const payment={id:randomUUID(),amount,paidAt:paidAtIso,method,transactionRef,proofFileId,note:text(formData.get("note"),2000),recordedById:user.id};
  const result=await mutateFinanceExpense(id,current=>{
    const raced=current.payments.find(p=>p.transactionRef===transactionRef);
    if(raced){
      if(Math.abs(raced.amount-amount)>=0.005) throw new Error(`Transaction reference ${transactionRef} is already recorded with a different amount.`);
      return{expense:current,result:{duplicate:true,payment:raced,expense:current,status:current.status}};
    }
    if(!["APPROVED","PARTIALLY_PAID"].includes(current.status))throw new Error("Expense is no longer payable");
    const latestRemaining=expenseRemaining(current); if(amount>latestRemaining+0.005) throw new Error("Expense balance changed while payment was being recorded. Refresh and retry.");
    const payments=[...current.payments,payment]; const total=Math.round(payments.reduce((s,p)=>s+p.amount,0)*100)/100; const status:ExpenseStatus=total>=current.amount?"PAID":"PARTIALLY_PAID";
    const next:FinanceExpense={...current,payments,status};
    return{expense:next,result:{duplicate:false,payment,expense:next,status}};
  });
  if(result.duplicate)return;

  await ensureUniversalFinancialReceipt({sourceType:"EXPENSE",sourceId:result.payment.id,clientId:result.expense.clientId,amount,currency:result.expense.currency,direction:"DEBIT",title:"Expense payment receipt",description:`${result.expense.expenseNumber} · ${result.expense.vendorName} · ${result.expense.description}`,status:"PAID",method,transactionReference:transactionRef,issuedById:user.id});
  await audit({userId:user.id,action:"EXPENSE_PAYMENT_RECORDED",resourceType:"Expense",resourceId:id,after:{paymentId:result.payment.id,amount,currency:result.expense.currency,method,transactionRef,proofFileId,status:result.status,authorizationId:authorization.id}});
  await logActivity({userId:user.id,type:"FINANCE_EXPENSE_PAID",message:`Recorded ${result.expense.currency} ${amount.toFixed(2)} on ${result.expense.expenseNumber}`,clientId:result.expense.clientId||undefined,caseId:result.expense.caseId||undefined});
  revalidatePath(`/app/finance/expenses/${id}`); revalidatePath("/app/finance/expenses"); revalidatePath("/app/finance"); revalidatePath("/app/company-funds/authorizations"); revalidatePath("/app/company-funds/execution-evidence");
}
