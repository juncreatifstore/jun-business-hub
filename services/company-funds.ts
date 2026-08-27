"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  addProjectIntegration, addTreasuryAccount, addTreasuryInvestment, addTreasuryLoan,
  addTreasuryPartner, addTreasurySource, updateTreasuryAccountBalance,
  type TreasuryAccountType, type TreasuryConnectionMode, type TreasuryInvestmentStatus,
  type TreasuryLoanStatus, type TreasuryPartnerType, type TreasurySourceKind,
} from "@/lib/company-funds";

async function superAdmin() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/app/forbidden");
  return user;
}
function text(form: FormData, key: string, max = 500) { return String(form.get(key) || "").trim().slice(0, max); }
function money(form: FormData, key: string) { const n = Number(String(form.get(key) || "0").replace(/,/g,"")); if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`); return Math.round(n*100)/100; }
function refresh() { revalidatePath("/app/company-funds"); }

export async function createTreasuryAccountAction(form: FormData) {
  const user = await superAdmin();
  const account = await addTreasuryAccount({
    name: text(form,"name",120), country: text(form,"country",80), institution: text(form,"institution",120),
    type: text(form,"type") as TreasuryAccountType, currency: text(form,"currency",3).toUpperCase(), balance: money(form,"balance"),
    connectionMode: text(form,"connectionMode") as TreasuryConnectionMode, provider: text(form,"provider",100), externalRef: text(form,"externalRef",120),
    active: true, dailyUpdateRequired: form.get("dailyUpdateRequired") === "on", note: text(form,"note",500),
  });
  await audit({userId:user.id,action:"COMPANY_FUNDS_ACCOUNT_CREATE",resourceType:"TreasuryAccount",resourceId:account.id,after:{name:account.name,country:account.country,currency:account.currency}}); refresh();
}
export async function updateTreasuryAccountBalanceAction(id:string, form:FormData) {
  const user=await superAdmin(); const account=await updateTreasuryAccountBalance(id,money(form,"balance"));
  await audit({userId:user.id,action:"COMPANY_FUNDS_ACCOUNT_BALANCE",resourceType:"TreasuryAccount",resourceId:id,after:{balance:account.balance,currency:account.currency}}); refresh();
}
export async function createTreasurySourceAction(form:FormData){
  const user=await superAdmin(); const source=await addTreasurySource({name:text(form,"name",120),kind:text(form,"kind") as TreasurySourceKind,country:text(form,"country",80),currency:text(form,"currency",3).toUpperCase(),amount:money(form,"amount"),receivedAt:text(form,"receivedAt",40)||new Date().toISOString(),accountId:text(form,"accountId")||null,partnerId:text(form,"partnerId")||null,note:text(form,"note",500)});
  await audit({userId:user.id,action:"COMPANY_FUNDS_SOURCE_CREATE",resourceType:"TreasurySource",resourceId:source.id,after:{name:source.name,amount:source.amount,currency:source.currency}});refresh();
}
export async function createTreasuryPartnerAction(form:FormData){
  const user=await superAdmin(); const partner=await addTreasuryPartner({name:text(form,"name",140),type:text(form,"type") as TreasuryPartnerType,country:text(form,"country",80),email:text(form,"email",160),phone:text(form,"phone",60),ownershipPercent:money(form,"ownershipPercent"),profitSharePercent:money(form,"profitSharePercent"),capitalContributed:money(form,"capitalContributed"),currency:text(form,"currency",3).toUpperCase(),status:"ACTIVE",note:text(form,"note",500)});
  await audit({userId:user.id,action:"COMPANY_FUNDS_PARTNER_CREATE",resourceType:"TreasuryPartner",resourceId:partner.id,after:{name:partner.name,capitalContributed:partner.capitalContributed}});refresh();
}
export async function createTreasuryLoanAction(form:FormData){
  const user=await superAdmin(); const principal=money(form,"principal"); const loan=await addTreasuryLoan({lender:text(form,"lender",140),borrower:text(form,"borrower",140),country:text(form,"country",80),currency:text(form,"currency",3).toUpperCase(),principal,outstandingBalance:form.get("outstandingBalance")?money(form,"outstandingBalance"):principal,interestRate:money(form,"interestRate"),startDate:text(form,"startDate",40),dueDate:text(form,"dueDate",40),paymentFrequency:text(form,"paymentFrequency",80),status:(text(form,"status")||"ACTIVE") as TreasuryLoanStatus,collateral:text(form,"collateral",300),guarantor:text(form,"guarantor",160),purpose:text(form,"purpose",300),note:text(form,"note",500)});
  await audit({userId:user.id,action:"COMPANY_FUNDS_LOAN_CREATE",resourceType:"TreasuryLoan",resourceId:loan.id,after:{lender:loan.lender,principal:loan.principal,currency:loan.currency}});refresh();
}
export async function createTreasuryInvestmentAction(form:FormData){
  const user=await superAdmin(); const investment=await addTreasuryInvestment({name:text(form,"name",140),country:text(form,"country",80),currency:text(form,"currency",3).toUpperCase(),amount:money(form,"amount"),investedAt:text(form,"investedAt",40),projectIntegrationId:text(form,"projectIntegrationId")||null,expectedReturnPercent:money(form,"expectedReturnPercent"),status:(text(form,"status")||"ACTIVE") as TreasuryInvestmentStatus,counterparty:text(form,"counterparty",160),note:text(form,"note",500)});
  await audit({userId:user.id,action:"COMPANY_FUNDS_INVESTMENT_CREATE",resourceType:"TreasuryInvestment",resourceId:investment.id,after:{name:investment.name,amount:investment.amount,currency:investment.currency}});refresh();
}
export async function createProjectIntegrationAction(form:FormData){
  const user=await superAdmin(); const apiKey=text(form,"apiKey",256); if(apiKey.length<20) throw new Error("API key must contain at least 20 characters");
  const integration=await addProjectIntegration({code:text(form,"code",80),name:text(form,"name",140),country:text(form,"country",80),currency:text(form,"currency",3).toUpperCase(),caseId:text(form,"caseId")||null,apiKey});
  await audit({userId:user.id,action:"COMPANY_FUNDS_PROJECT_CONNECT",resourceType:"ProjectIntegration",resourceId:integration.id,after:{code:integration.code,name:integration.name,currency:integration.currency}});refresh();
}
