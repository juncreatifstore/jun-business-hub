"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { confirmTreasuryTransactionMatch, ignoreTreasuryBankTransaction } from "@/lib/company-funds-transaction-reconciliation";

async function superAdmin(){const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");return user}
function refresh(){revalidatePath("/app/company-funds/reconciliation");revalidatePath("/app/company-funds");revalidatePath("/app/company-funds/executive")}
export async function confirmTreasuryTransactionMatchAction(financeEntryId:string,bankTransactionId:string,formData?:FormData){const user=await superAdmin();const note=String(formData?.get("note")||"").trim().slice(0,500);const match=await confirmTreasuryTransactionMatch({financeEntryId,bankTransactionId,userId:user.id,note,method:"MANUAL"});await audit({userId:user.id,action:"COMPANY_FUNDS_TX_RECONCILE",resourceType:"TreasuryTransactionMatch",resourceId:match.id,after:{financeEntryId,bankTransactionId,amountDifference:match.amountDifference,dayDifference:match.dayDifference}});refresh()}
export async function acceptTreasurySuggestedMatchAction(financeEntryId:string,bankTransactionId:string){const user=await superAdmin();const match=await confirmTreasuryTransactionMatch({financeEntryId,bankTransactionId,userId:user.id,note:"Suggestion automatique confirmée",method:"AUTO"});await audit({userId:user.id,action:"COMPANY_FUNDS_TX_AUTO_MATCH_CONFIRM",resourceType:"TreasuryTransactionMatch",resourceId:match.id,after:{financeEntryId,bankTransactionId}});refresh()}
export async function ignoreTreasuryBankTransactionAction(bankTransactionId:string,formData:FormData){const user=await superAdmin();const reason=String(formData.get("reason")||"").trim().slice(0,500);const row=await ignoreTreasuryBankTransaction({bankTransactionId,reason,userId:user.id});await audit({userId:user.id,action:"COMPANY_FUNDS_BANK_TX_IGNORE",resourceType:"TreasuryBankTransaction",resourceId:bankTransactionId,after:{reason:row.reason}});refresh()}
