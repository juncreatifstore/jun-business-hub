"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";

async function superAdmin(){const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");return user}
function text(form:FormData,key:string,max=1000){return String(form.get(key)||"").trim().slice(0,max)}
function refresh(){revalidatePath("/app/company-funds/execution-evidence");revalidatePath("/app/company-funds/authorizations");revalidatePath("/app/company-funds/transfers");revalidatePath("/app/company-funds/executive");revalidatePath("/app/company-funds")}
export async function recordFinancialExecutionEvidenceAction(authorizationId:string,formData:FormData):Promise<void>{const user=await superAdmin();const evidence=await createFinancialExecutionEvidence({authorizationId,treasuryAccountId:text(formData,"treasuryAccountId",100)||null,transactionReference:text(formData,"transactionReference",180),proofFileId:text(formData,"proofFileId",100),note:text(formData,"note",1000),executedById:user.id,executedAt:text(formData,"executedAt",40)||null});await audit({userId:user.id,action:"COMPANY_FINANCIAL_EXECUTION_EVIDENCE",resourceType:"FinancialExecutionEvidence",resourceId:evidence.id,after:{authorizationId:evidence.authorizationId,type:evidence.type,resourceId:evidence.resourceId,treasuryAccountId:evidence.treasuryAccountId,transactionReference:evidence.transactionReference,proofFileId:evidence.proofFileId,executedAt:evidence.executedAt}});refresh()}
