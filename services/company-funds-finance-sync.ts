"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setFinanceTreasuryMapping, setOutgoingTreasuryAccount, syncCompanyFinanceState } from "@/lib/company-funds-finance-sync";

async function superAdmin(){const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");return user}
function text(form:FormData,key:string,max=120){return String(form.get(key)||"").trim().slice(0,max)}
function refresh(){revalidatePath("/app/company-funds");revalidatePath("/app/company-funds/consolidation");revalidatePath("/app/company-funds/dashboard")}

export async function mapFinanceAccountToTreasuryAction(financeAccountId:string,form:FormData){const user=await superAdmin();const treasuryAccountId=text(form,"treasuryAccountId",100)||null;await setFinanceTreasuryMapping(financeAccountId,treasuryAccountId);await syncCompanyFinanceState();await audit({userId:user.id,action:"COMPANY_FUNDS_FINANCE_ACCOUNT_MAP",resourceType:"FinancePaymentAccount",resourceId:financeAccountId,after:{treasuryAccountId}});refresh()}
export async function setOutgoingTreasuryAccountAction(currency:string,form:FormData){const user=await superAdmin();const treasuryAccountId=text(form,"treasuryAccountId",100)||null;await setOutgoingTreasuryAccount(currency,treasuryAccountId);await syncCompanyFinanceState();await audit({userId:user.id,action:"COMPANY_FUNDS_OUTGOING_ACCOUNT_MAP",resourceType:"TreasuryAccount",resourceId:treasuryAccountId||currency,after:{currency:currency.toUpperCase(),treasuryAccountId}});refresh()}
export async function syncCompanyFinanceNowAction(){const user=await superAdmin();const state=await syncCompanyFinanceState();await audit({userId:user.id,action:"COMPANY_FUNDS_FINANCE_SYNC",resourceType:"CompanyFunds",resourceId:"finance-consolidation",after:{entryCount:state.entryCount,lastSyncedAt:state.lastSyncedAt}});refresh()}
