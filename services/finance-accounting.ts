"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { closeAccountingPeriod, syncAccountingLedger } from "@/lib/finance-accounting";

export async function syncAccountingLedgerAction(){
  const user=await assertPermission("ACCOUNTING_POST");
  const result=await syncAccountingLedger(user.id);
  await audit({userId:user.id,action:"ACCOUNTING_SYNC",resourceType:"AccountingLedger",after:result});
  revalidatePath("/app/finance/accounting");
  revalidatePath("/app/finance/accounting/statements");
  redirect(`/app/finance/accounting?success=${encodeURIComponent(`Ledger synchronized: ${result.created} created, ${result.skipped} already posted, ${result.closed} blocked by closed periods.`)}`);
}

export async function closeAccountingPeriodAction(formData:FormData){
  const user=await assertPermission("ACCOUNTING_CLOSE");
  const period=String(formData.get("period")||"").trim();
  const confirmation=String(formData.get("confirmation")||"").trim().toUpperCase();
  const note=String(formData.get("note")||"").trim();
  if(confirmation!=="CLOSE") redirect(`/app/finance/accounting/close?error=${encodeURIComponent("Type CLOSE to confirm the accounting period lock.")}`);
  try{
    // Synchronize all currently eligible source events before locking the period.
    await syncAccountingLedger(user.id);
    const closed=await closeAccountingPeriod(period,user.id,note);
    await audit({userId:user.id,action:"ACCOUNTING_PERIOD_CLOSE",resourceType:"AccountingPeriod",resourceId:period,after:closed});
    revalidatePath("/app/finance/accounting");revalidatePath("/app/finance/accounting/close");revalidatePath("/app/finance/accounting/statements");
    redirect(`/app/finance/accounting/close?success=${encodeURIComponent(`Period ${period} closed.`)}`);
  }catch(error){redirect(`/app/finance/accounting/close?error=${encodeURIComponent(error instanceof Error?error.message:"Unable to close period")}`);}
}
