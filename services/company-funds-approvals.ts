"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { decideFinancialAuthorization, getFinancialAuthorizationPolicy, saveFinancialAuthorizationPolicy } from "@/lib/company-funds-approvals";

async function superAdmin(){const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");return user}
function refresh(){revalidatePath("/app/company-funds/authorizations");revalidatePath("/app/company-funds/transfers");revalidatePath("/app/company-funds/executive")}
export async function approveFinancialAuthorizationAction(id:string,formData:FormData):Promise<void>{const user=await superAdmin();const note=String(formData.get("note")||"").trim().slice(0,1000);const a=await decideFinancialAuthorization(id,user.id,"APPROVE",note);await audit({userId:user.id,action:"COMPANY_FINANCIAL_AUTH_APPROVE",resourceType:"FinancialAuthorization",resourceId:id,after:{status:a.status,requiredApprovals:a.requiredApprovals,approvals:a.decisions.filter(d=>d.decision==="APPROVE").length}});refresh()}
export async function rejectFinancialAuthorizationAction(id:string,formData:FormData):Promise<void>{const user=await superAdmin();const note=String(formData.get("note")||"").trim().slice(0,1000);const a=await decideFinancialAuthorization(id,user.id,"REJECT",note);await audit({userId:user.id,action:"COMPANY_FINANCIAL_AUTH_REJECT",resourceType:"FinancialAuthorization",resourceId:id,after:{status:a.status,note}});refresh()}
export async function updateFinancialAuthorizationPolicyAction(formData:FormData):Promise<void>{const user=await superAdmin();const single=Math.max(0,Number(formData.get("singleApprovalThreshold")||0));const dual=Math.max(single,Number(formData.get("dualApprovalThreshold")||0));if(!Number.isFinite(single)||!Number.isFinite(dual))throw new Error("Invalid authorization thresholds");const before=await getFinancialAuthorizationPolicy();const next=await saveFinancialAuthorizationPolicy({singleApprovalThreshold:single,dualApprovalThreshold:dual,reserveOverrideAlwaysDual:String(formData.get("reserveOverrideAlwaysDual")||"")==="on"});await audit({userId:user.id,action:"COMPANY_FINANCIAL_AUTH_POLICY_UPDATE",resourceType:"FinancialAuthorizationPolicy",resourceId:"global",before,after:next});refresh()}
