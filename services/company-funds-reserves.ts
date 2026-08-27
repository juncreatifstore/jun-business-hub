"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createFinancialReserve, setFinancialReserveActive, updateFinancialReserveAmount, type ReserveKind } from "@/lib/company-funds-reserves";

async function superAdmin(){const user=await requireUser();if(user.role!=="SUPER_ADMIN")throw new Error("Forbidden");return user}
function money(v:FormDataEntryValue|null){const n=Number(v);return Number.isFinite(n)?Math.round(n*100)/100:NaN}
function text(v:FormDataEntryValue|null,max=500){return String(v||"").trim().slice(0,max)}
function refresh(){revalidatePath("/app/company-funds/reserves");revalidatePath("/app/company-funds");revalidatePath("/app/company-funds/executive")}

export async function createFinancialReserveAction(formData:FormData){const user=await superAdmin();const kind=text(formData.get("kind"),40) as ReserveKind;const allowed:ReserveKind[]=["EMERGENCY","TAX","CLIENT_REFUNDS","OPERATING","INVESTMENT","COUNTRY_MINIMUM","OTHER"];if(!allowed.includes(kind))throw new Error("Invalid reserve kind");const targetAmount=money(formData.get("targetAmount"));const reservedAmount=money(formData.get("reservedAmount"));if(!Number.isFinite(targetAmount)||targetAmount<=0||!Number.isFinite(reservedAmount)||reservedAmount<0)throw new Error("Invalid reserve amounts");const reserve=await createFinancialReserve({name:text(formData.get("name"),160),kind,country:text(formData.get("country"),100)||null,currency:text(formData.get("currency"),3).toUpperCase(),accountId:text(formData.get("accountId"),100)||null,targetAmount,reservedAmount,note:text(formData.get("note"),1000)});await audit({userId:user.id,action:"COMPANY_RESERVE_CREATE",resourceType:"CompanyFinancialReserve",resourceId:reserve.id,after:reserve});refresh()}
export async function updateFinancialReserveAmountAction(id:string,formData:FormData){const user=await superAdmin();const amount=money(formData.get("reservedAmount"));if(!Number.isFinite(amount)||amount<0)throw new Error("Invalid reserve amount");const reserve=await updateFinancialReserveAmount(id,amount);await audit({userId:user.id,action:"COMPANY_RESERVE_AMOUNT_UPDATE",resourceType:"CompanyFinancialReserve",resourceId:id,after:{reservedAmount:reserve.reservedAmount}});refresh()}
export async function setFinancialReserveActiveAction(id:string,active:boolean){const user=await superAdmin();const reserve=await setFinancialReserveActive(id,active);await audit({userId:user.id,action:active?"COMPANY_RESERVE_ACTIVATE":"COMPANY_RESERVE_DEACTIVATE",resourceType:"CompanyFinancialReserve",resourceId:id,after:{active}});refresh();return reserve}
