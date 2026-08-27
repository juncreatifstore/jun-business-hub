"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { closeFinancialMonth, reopenFinancialMonth } from "@/lib/company-funds-monthly-close";

async function superAdmin(){const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");return user}
function refresh(){revalidatePath("/app/company-funds/monthly-close");revalidatePath("/app/company-funds/executive");revalidatePath("/app/company-funds")}
export async function closeFinancialMonthAction(formData:FormData):Promise<void>{const user=await superAdmin();const period=String(formData.get("period")||"").trim();const note=String(formData.get("note")||"").trim();const row=await closeFinancialMonth(period,user.id,note);await audit({userId:user.id,action:"COMPANY_FINANCIAL_MONTH_CLOSE",resourceType:"MonthlyFinancialClose",resourceId:row.id,after:{period:row.period,status:row.status,closedAt:row.closedAt,note:row.closeNote,snapshot:{accounts:row.snapshot.accounts.length,reserves:row.snapshot.reserves.length,loans:row.snapshot.loans.length,investments:row.snapshot.investments.length,financeCurrencies:row.snapshot.financeByCurrency.length}}});refresh()}
export async function reopenFinancialMonthAction(period:string,formData:FormData):Promise<void>{const user=await superAdmin();const reason=String(formData.get("reason")||"").trim();const row=await reopenFinancialMonth(period,user.id,reason);await audit({userId:user.id,action:"COMPANY_FINANCIAL_MONTH_REOPEN",resourceType:"MonthlyFinancialClose",resourceId:row.id,before:{status:"CLOSED"},after:{period:row.period,status:row.status,reopenReason:row.reopenReason,reopenedAt:row.reopenedAt}});refresh()}
