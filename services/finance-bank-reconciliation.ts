"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  closeBankReconciliationPeriod,
  confirmReconciliation,
  getBankTransaction,
  importBankStatement,
  ignoreBankTransaction,
  suggestMatchesForImport,
} from "@/lib/finance-bank-reconciliation";

function go(path:string,type:"success"|"error",message:string):never { redirect(`${path}?${type}=${encodeURIComponent(message)}`); }

export async function importBankStatementAction(formData:FormData){
  const user=await assertPermission("BANK_RECON_IMPORT");
  const file=formData.get("statement");
  const bankName=String(formData.get("bankName")||"").trim();
  const accountLabel=String(formData.get("accountLabel")||"").trim();
  const accountLast4=String(formData.get("accountLast4")||"").trim();
  const currency=String(formData.get("currency")||"USD").trim().toUpperCase();
  if(!(file instanceof File)||file.size===0) go("/app/finance/reconciliation/import","error","Choose a CSV or OFX statement file.");
  if(file.size>8*1024*1024) go("/app/finance/reconciliation/import","error","Statement file must be 8 MB or smaller.");
  if(!bankName||!accountLabel||!/^[A-Z]{3}$/.test(currency)) go("/app/finance/reconciliation/import","error","Bank, account label and a valid 3-letter currency are required.");
  const lower=file.name.toLowerCase();const format=lower.endsWith(".ofx")||lower.endsWith(".qfx")?"OFX":"CSV" as const;
  try{
    const record=await importBankStatement({fileName:file.name,content:await file.text(),format,bankName,accountLabel,accountLast4,currency,importedById:user.id});
    await audit({userId:user.id,action:"BANK_STATEMENT_IMPORT",resourceType:"BankStatementImport",resourceId:record.id,after:{fileName:record.fileName,format:record.format,currency:record.currency,transactionCount:record.transactionCount,duplicateCount:record.duplicateCount}});
    revalidatePath("/app/finance/reconciliation");
    revalidatePath(`/app/finance/reconciliation/${record.id}`);
    go(`/app/finance/reconciliation/${record.id}`,"success",`Imported ${record.transactionCount} transaction(s); ${record.duplicateCount} duplicate(s) skipped.`);
  }catch(error){go("/app/finance/reconciliation/import","error",error instanceof Error?error.message:"Unable to import statement");}
}

export async function refreshBankSuggestionsAction(importId:string){
  const user=await assertPermission("BANK_RECON_APPROVE");
  const count=await suggestMatchesForImport(importId);
  await audit({userId:user.id,action:"BANK_RECON_SUGGEST",resourceType:"BankStatementImport",resourceId:importId,after:{suggested:count}});
  revalidatePath(`/app/finance/reconciliation/${importId}`);
  go(`/app/finance/reconciliation/${importId}`,"success",`${count} match suggestion(s) refreshed.`);
}

export async function confirmBankMatchAction(formData:FormData){
  const user=await assertPermission("BANK_RECON_APPROVE");
  const transactionId=String(formData.get("transactionId")||"");
  const journalEntryId=String(formData.get("journalEntryId")||"");
  const note=String(formData.get("note")||"");
  const tx=await getBankTransaction(transactionId);if(!tx) go("/app/finance/reconciliation","error","Bank transaction not found.");
  try{
    const match=await confirmReconciliation(transactionId,journalEntryId,user.id,note,tx.suggestedEntryId===journalEntryId?"AUTO_SUGGESTED":"MANUAL");
    await audit({userId:user.id,action:"BANK_RECON_CONFIRM",resourceType:"BankReconciliationMatch",resourceId:match.id,after:{transactionId,journalEntryId,amountDifference:match.amountDifference,dayDifference:match.dayDifference,method:match.method}});
    revalidatePath(`/app/finance/reconciliation/${tx.importId}`);
    go(`/app/finance/reconciliation/${tx.importId}`,"success","Transaction reconciled.");
  }catch(error){go(`/app/finance/reconciliation/${tx.importId}`,"error",error instanceof Error?error.message:"Unable to reconcile transaction");}
}

export async function ignoreBankTransactionAction(formData:FormData){
  const user=await assertPermission("BANK_RECON_APPROVE");
  const id=String(formData.get("transactionId")||"");const tx=await getBankTransaction(id);if(!tx) go("/app/finance/reconciliation","error","Bank transaction not found.");
  try{await ignoreBankTransaction(id);await audit({userId:user.id,action:"BANK_RECON_IGNORE",resourceType:"BankTransaction",resourceId:id,after:{status:"IGNORED"}});revalidatePath(`/app/finance/reconciliation/${tx.importId}`);go(`/app/finance/reconciliation/${tx.importId}`,"success","Transaction marked ignored.");}catch(error){go(`/app/finance/reconciliation/${tx.importId}`,"error",error instanceof Error?error.message:"Unable to ignore transaction");}
}

export async function closeBankReconciliationPeriodAction(formData:FormData){
  const user=await assertPermission("BANK_RECON_CLOSE");
  const period=String(formData.get("period")||"").trim();const currency=String(formData.get("currency")||"").trim().toUpperCase();const accountLabel=String(formData.get("accountLabel")||"").trim();const note=String(formData.get("note")||"").trim();const confirmation=String(formData.get("confirmation")||"").trim().toUpperCase();
  if(confirmation!=="CLOSE") go("/app/finance/reconciliation/close","error","Type CLOSE to confirm the reconciliation lock.");
  try{const record=await closeBankReconciliationPeriod({period,currency,accountLabel,closedById:user.id,note});await audit({userId:user.id,action:"BANK_RECON_PERIOD_CLOSE",resourceType:"BankReconciliationPeriod",resourceId:`${period}:${currency}:${accountLabel}`,after:record});revalidatePath("/app/finance/reconciliation");revalidatePath("/app/finance/reconciliation/close");go("/app/finance/reconciliation/close","success",`Reconciliation period ${period} closed.`);}catch(error){go("/app/finance/reconciliation/close","error",error instanceof Error?error.message:"Unable to close reconciliation period");}
}
