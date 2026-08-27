"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureFinancialAuthorization } from "@/lib/company-funds-approvals";
import {
  addProjectIntegration, addTreasuryAccount, addTreasuryForecastItem, addTreasuryInvestment, addTreasuryLoan,
  addTreasuryPartner, addTreasurySource, resolveTreasuryReconciliation, setTreasuryAccountConnectionKey,
  updateTreasuryAccountBalance, updateTreasuryForecastStatus,
  type TreasuryAccountType, type TreasuryConnectionMode, type TreasuryDirection, type TreasuryForecastStatus,
  type TreasuryLoanStatus, type TreasuryPartnerType, type TreasurySourceKind,
} from "@/lib/company-funds";

async function superAdmin() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/app/forbidden");
  return user;
}
function text(form: FormData, key: string, max = 500) { return String(form.get(key) || "").trim().slice(0, max); }
function money(form: FormData, key: string) { const n = Number(String(form.get(key) || "0").replace(/,/g,"")); if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a non-negative number`); return Math.round(n*100)/100; }
function refresh() { revalidatePath("/app/company-funds"); revalidatePath("/app/company-funds/authorizations"); revalidatePath("/app/company-funds/executive"); }

export async function createTreasuryAccountAction(form: FormData) {
  const user = await superAdmin();
  const connectionMode = text(form,"connectionMode") as TreasuryConnectionMode;
  const connectionKey = text(form,"connectionKey",256);
  if (connectionMode === "CONNECTED" && connectionKey.length > 0 && connectionKey.length < 20) throw new Error("Connection key must contain at least 20 characters");
  const account = await addTreasuryAccount({
    name: text(form,"name",120), country: text(form,"country",80), institution: text(form,"institution",120),
    type: text(form,"type") as TreasuryAccountType, currency: text(form,"currency",3).toUpperCase(), balance: money(form,"balance"),
    connectionMode, provider: text(form,"provider",100), externalRef: text(form,"externalRef",120),
    active: true, dailyUpdateRequired: form.get("dailyUpdateRequired") === "on", note: text(form,"note",500),
    connectionKeyHash: null, lastExternalSyncId: null,
  });
  if (connectionMode === "CONNECTED" && connectionKey.length >= 20) await setTreasuryAccountConnectionKey(account.id, connectionKey);
  await audit({userId:user.id,action:"COMPANY_FUNDS_ACCOUNT_CREATE",resourceType:"TreasuryAccount",resourceId:account.id,after:{name:account.name,country:account.country,currency:account.currency,connectionMode}}); refresh();
}
export async function updateTreasuryAccountBalanceAction(id:string, form:FormData) {
  const user=await superAdmin(); const account=await updateTreasuryAccountBalance(id,money(form,"balance"));
  await audit({userId:user.id,action:"COMPANY_FUNDS_ACCOUNT_BALANCE",resourceType:"TreasuryAccount",resourceId:id,after:{balance:account.balance,currency:account.currency}}); refresh();
}
export async function configureTreasuryAccountConnectionAction(id:string, form:FormData) {
  const user=await superAdmin(); const apiKey=text(form,"connectionKey",256); if(apiKey.length<20) throw new Error("Connection key must contain at least 20 characters");
  const account=await setTreasuryAccountConnectionKey(id,apiKey);
  await audit({userId:user.id,action:"COMPANY_FUNDS_ACCOUNT_CONNECT",resourceType:"TreasuryAccount",resourceId:id,after:{provider:account.provider,externalRef:account.externalRef}}); refresh();
}
export async function resolveTreasuryReconciliationAction(id:string, form:FormData) {
  const user=await superAdmin(); const row=await resolveTreasuryReconciliation(id,text(form,"note",500));
  await audit({userId:user.id,action:"COMPANY_FUNDS_RECONCILIATION_RESOLVE",resourceType:"TreasuryReconciliation",resourceId:id,after:{difference:row.difference,status:row.status}}); refresh();
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
  const user=await superAdmin(); const amount=money(form,"amount"); const currency=text(form,"currency",3).toUpperCase();
  const investment=await addTreasuryInvestment({name:text(form,"name",140),country:text(form,"country",80),currency,amount,investedAt:text(form,"investedAt",40),projectIntegrationId:text(form,"projectIntegrationId")||null,expectedReturnPercent:money(form,"expectedReturnPercent"),status:"PLANNED",counterparty:text(form,"counterparty",160),note:text(form,"note",500)});
  const authorization=await ensureFinancialAuthorization({type:"INVESTMENT",resourceId:investment.id,reference:`INV-${investment.id.slice(0,8).toUpperCase()}`,description:`Investissement ${investment.name}`,amount:investment.amount,currency:investment.currency,requestedById:user.id});
  await audit({userId:user.id,action:"COMPANY_FUNDS_INVESTMENT_CREATE",resourceType:"TreasuryInvestment",resourceId:investment.id,after:{name:investment.name,amount:investment.amount,currency:investment.currency,status:investment.status,authorizationId:authorization.id}});refresh();
}
export async function createTreasuryForecastItemAction(form:FormData){
  const user=await superAdmin();
  const item=await addTreasuryForecastItem({
    label:text(form,"label",160),direction:text(form,"direction") as TreasuryDirection,amount:money(form,"amount"),currency:text(form,"currency",3).toUpperCase(),
    dueDate:text(form,"dueDate",40),category:text(form,"category",80),projectIntegrationId:text(form,"projectIntegrationId")||null,accountId:text(form,"accountId")||null,
    status:"PLANNED",note:text(form,"note",500),
  });
  await audit({userId:user.id,action:"COMPANY_FUNDS_FORECAST_CREATE",resourceType:"TreasuryForecastItem",resourceId:item.id,after:{label:item.label,direction:item.direction,amount:item.amount,currency:item.currency,dueDate:item.dueDate}});refresh();
}
export async function setTreasuryForecastStatusAction(id:string,form:FormData){
  const user=await superAdmin(); const status=text(form,"status") as TreasuryForecastStatus; if(!["PLANNED","CONFIRMED","PAID","CANCELLED"].includes(status)) throw new Error("Invalid forecast status");
  const item=await updateTreasuryForecastStatus(id,status); await audit({userId:user.id,action:"COMPANY_FUNDS_FORECAST_STATUS",resourceType:"TreasuryForecastItem",resourceId:id,after:{status:item.status}});refresh();
}
export async function createProjectIntegrationAction(form:FormData){
  const user=await superAdmin(); const apiKey=text(form,"apiKey",256); if(apiKey.length<20) throw new Error("API key must contain at least 20 characters");
  const integration=await addProjectIntegration({code:text(form,"code",80),name:text(form,"name",140),country:text(form,"country",80),currency:text(form,"currency",3).toUpperCase(),caseId:text(form,"caseId")||null,apiKey});
  await audit({userId:user.id,action:"COMPANY_FUNDS_PROJECT_CONNECT",resourceType:"ProjectIntegration",resourceId:integration.id,after:{code:integration.code,name:integration.name,currency:integration.currency}});refresh();
}
