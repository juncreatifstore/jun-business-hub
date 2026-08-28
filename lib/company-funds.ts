import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";

export const COMPANY_FUNDS_PREFIX = "company.funds.";
const STORE_KEY = `${COMPANY_FUNDS_PREFIX}store`;

export type TreasuryAccountType = "BANK" | "WALLET" | "CASH" | "PROCESSOR" | "OTHER";
export type TreasuryConnectionMode = "CONNECTED" | "MANUAL";
export type TreasurySourceKind = "REVENUE" | "OWNER_CAPITAL" | "PARTNER_CAPITAL" | "INVESTMENT" | "LOAN" | "OTHER";
export type TreasuryPartnerType = "INDIVIDUAL" | "COMPANY";
export type TreasuryLoanStatus = "ACTIVE" | "PAID" | "DEFAULTED" | "CANCELLED";
export type TreasuryInvestmentStatus = "PLANNED" | "ACTIVE" | "EXITED" | "CANCELLED";
export type TreasuryDirection = "IN" | "OUT";
export type TreasuryReconciliationStatus = "MATCHED" | "REVIEW" | "RESOLVED";
export type TreasuryForecastStatus = "PLANNED" | "CONFIRMED" | "PAID" | "CANCELLED";

export type TreasuryAccount = {
  id: string; name: string; country: string; institution: string; type: TreasuryAccountType; currency: string;
  balance: number; connectionMode: TreasuryConnectionMode; provider: string; externalRef: string; active: boolean;
  dailyUpdateRequired: boolean; lastSyncAt: string | null; note: string; createdAt: string; updatedAt: string;
  connectionKeyHash?: string | null; lastExternalSyncId?: string | null;
};
export type TreasurySource = {
  id: string; name: string; kind: TreasurySourceKind; country: string; currency: string; amount: number;
  receivedAt: string; accountId: string | null; partnerId: string | null; note: string; createdAt: string;
};
export type TreasuryPartner = {
  id: string; name: string; type: TreasuryPartnerType; country: string; email: string; phone: string;
  ownershipPercent: number; profitSharePercent: number; capitalContributed: number; currency: string;
  status: "ACTIVE" | "INACTIVE"; note: string; createdAt: string; updatedAt: string;
};
export type TreasuryLoan = {
  id: string; lender: string; borrower: string; country: string; currency: string; principal: number;
  outstandingBalance: number; interestRate: number; startDate: string; dueDate: string; paymentFrequency: string;
  status: TreasuryLoanStatus; collateral: string; guarantor: string; purpose: string; note: string;
  createdAt: string; updatedAt: string;
};
export type TreasuryInvestment = {
  id: string; name: string; country: string; currency: string; amount: number; investedAt: string;
  projectIntegrationId: string | null; expectedReturnPercent: number; status: TreasuryInvestmentStatus;
  counterparty: string; note: string; createdAt: string; updatedAt: string;
};
export type ProjectIntegration = {
  id: string; code: string; name: string; country: string; currency: string; caseId: string | null;
  apiKeyHash: string; enabled: boolean; lastSyncAt: string | null; lastExternalId: string | null;
  createdAt: string; updatedAt: string;
};
export type ProjectCashflow = {
  id: string; integrationId: string; externalId: string; direction: TreasuryDirection; category: string;
  amount: number; currency: string; occurredAt: string; description: string; accountId: string | null;
  createdAt: string;
};
export type TreasuryAccountSnapshot = {
  id: string; accountId: string; balance: number; source: "MANUAL" | "PROVIDER"; externalId: string | null;
  capturedAt: string; createdAt: string;
};
export type TreasuryReconciliation = {
  id: string; accountId: string; expectedBalance: number; reportedBalance: number; difference: number;
  status: TreasuryReconciliationStatus; periodStart: string | null; periodEnd: string; note: string;
  createdAt: string; resolvedAt: string | null;
};
export type TreasuryForecastItem = {
  id: string; label: string; direction: TreasuryDirection; amount: number; currency: string; dueDate: string;
  category: string; projectIntegrationId: string | null; accountId: string | null; status: TreasuryForecastStatus;
  note: string; createdAt: string; updatedAt: string;
};
export type TreasuryStore = {
  accounts: TreasuryAccount[]; sources: TreasurySource[]; partners: TreasuryPartner[]; loans: TreasuryLoan[];
  investments: TreasuryInvestment[]; integrations: ProjectIntegration[]; projectCashflows: ProjectCashflow[];
  accountSnapshots: TreasuryAccountSnapshot[]; reconciliations: TreasuryReconciliation[];
  forecastItems: TreasuryForecastItem[]; updatedAt: string;
};

const emptyStore = (): TreasuryStore => ({ accounts: [], sources: [], partners: [], loans: [], investments: [], integrations: [], projectCashflows: [], accountSnapshots: [], reconciliations: [], forecastItems: [], updatedAt: new Date().toISOString() });
function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function asMoney(v: unknown) { const n = Number(v || 0); return Number.isFinite(n) ? round(n) : 0; }

function normalizeStore(raw: unknown): TreasuryStore {
  const r = raw && typeof raw === "object" ? raw as Partial<TreasuryStore> : {};
  const accounts = Array.isArray(r.accounts) ? r.accounts.map(a => ({ ...a, connectionKeyHash: a.connectionKeyHash || null, lastExternalSyncId: a.lastExternalSyncId || null })) : [];
  return {
    accounts,
    sources: Array.isArray(r.sources) ? r.sources : [],
    partners: Array.isArray(r.partners) ? r.partners : [],
    loans: Array.isArray(r.loans) ? r.loans : [],
    investments: Array.isArray(r.investments) ? r.investments : [],
    integrations: Array.isArray(r.integrations) ? r.integrations : [],
    projectCashflows: Array.isArray(r.projectCashflows) ? r.projectCashflows : [],
    accountSnapshots: Array.isArray(r.accountSnapshots) ? r.accountSnapshots : [],
    reconciliations: Array.isArray(r.reconciliations) ? r.reconciliations : [],
    forecastItems: Array.isArray(r.forecastItems) ? r.forecastItems : [],
    updatedAt: String(r.updatedAt || new Date().toISOString()),
  };
}

export async function getTreasuryStore() {
  const row = await prisma.appSetting.findUnique({ where: { key: STORE_KEY }, select: { value: true } });
  if (!row) return emptyStore();
  try { return normalizeStore(JSON.parse(row.value)); } catch { return emptyStore(); }
}
export async function saveTreasuryStore(store: TreasuryStore) {
  const expectedVersion=String(store.updatedAt||"");
  const saved=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${STORE_KEY}))`;
    const currentRow=await tx.appSetting.findUnique({where:{key:STORE_KEY},select:{value:true}});
    if(currentRow){
      let current:TreasuryStore;
      try{current=normalizeStore(JSON.parse(currentRow.value));}catch{throw new Error("Treasury store is corrupted and cannot be updated safely.");}
      if(expectedVersion&&current.updatedAt!==expectedVersion){
        throw new Error("Treasury data changed concurrently. Refresh and retry; no financial data was overwritten.");
      }
    }
    const normalized={...store,updatedAt:new Date().toISOString()};
    const value=JSON.stringify(normalized);
    await tx.appSetting.upsert({where:{key:STORE_KEY},create:{key:STORE_KEY,value},update:{value}});
    return normalized;
  },{isolationLevel:"Serializable"});
  store.updatedAt=saved.updatedAt;
  return saved;
}

async function mutateTreasuryStore<T>(mutation:(store:TreasuryStore)=>T|Promise<T>):Promise<T>{
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${STORE_KEY}))`;
    const row=await tx.appSetting.findUnique({where:{key:STORE_KEY},select:{value:true}});
    let store:TreasuryStore;
    if(!row)store=emptyStore();
    else{try{store=normalizeStore(JSON.parse(row.value));}catch{throw new Error("Treasury store is corrupted and cannot be updated safely.");}}
    const result=await mutation(store);
    store.updatedAt=new Date().toISOString();
    const value=JSON.stringify(store);
    await tx.appSetting.upsert({where:{key:STORE_KEY},create:{key:STORE_KEY,value},update:{value}});
    return result;
  },{isolationLevel:"Serializable"});
}

function pushSnapshot(store: TreasuryStore, account: TreasuryAccount, source: "MANUAL" | "PROVIDER", externalId: string | null, capturedAt: string) {
  const snapshot: TreasuryAccountSnapshot = { id: randomUUID(), accountId: account.id, balance: account.balance, source, externalId, capturedAt, createdAt: new Date().toISOString() };
  store.accountSnapshots.unshift(snapshot);
  store.accountSnapshots = store.accountSnapshots.slice(0, 10000);
  return snapshot;
}

export async function addTreasuryAccount(input: Omit<TreasuryAccount, "id" | "createdAt" | "updatedAt" | "lastSyncAt">) {
  return mutateTreasuryStore(store=>{const now=new Date().toISOString();const account:TreasuryAccount={...input,id:randomUUID(),currency:input.currency.toUpperCase(),balance:asMoney(input.balance),connectionKeyHash:input.connectionKeyHash||null,lastExternalSyncId:null,lastSyncAt:input.connectionMode==="MANUAL"?now:null,createdAt:now,updatedAt:now};store.accounts.unshift(account);if(account.connectionMode==="MANUAL")pushSnapshot(store,account,"MANUAL",null,now);return account;});
}
export async function updateTreasuryAccountBalance(id: string, balance: number) {
  return mutateTreasuryStore(store=>{const account=store.accounts.find(a=>a.id===id);if(!account)throw new Error("Treasury account not found");account.balance=asMoney(balance);account.lastSyncAt=new Date().toISOString();account.updatedAt=account.lastSyncAt;pushSnapshot(store,account,"MANUAL",null,account.lastSyncAt);return account;});
}
export async function setTreasuryAccountConnectionKey(id: string, apiKey: string) {
  if (apiKey.trim().length < 20) throw new Error("Connection key must contain at least 20 characters");
  return mutateTreasuryStore(store=>{const account=store.accounts.find(a=>a.id===id);if(!account)throw new Error("Treasury account not found");account.connectionMode="CONNECTED";account.connectionKeyHash=sha256(apiKey.trim());account.updatedAt=new Date().toISOString();return account;});
}
export async function addTreasurySource(input: Omit<TreasurySource, "id" | "createdAt">) {
  return mutateTreasuryStore(store=>{const source:TreasurySource={...input,id:randomUUID(),currency:input.currency.toUpperCase(),amount:asMoney(input.amount),createdAt:new Date().toISOString()};store.sources.unshift(source);return source;});
}
export async function addTreasuryPartner(input: Omit<TreasuryPartner, "id" | "createdAt" | "updatedAt">) {
  return mutateTreasuryStore(store=>{const now=new Date().toISOString();const partner:TreasuryPartner={...input,id:randomUUID(),currency:input.currency.toUpperCase(),capitalContributed:asMoney(input.capitalContributed),ownershipPercent:asMoney(input.ownershipPercent),profitSharePercent:asMoney(input.profitSharePercent),createdAt:now,updatedAt:now};store.partners.unshift(partner);return partner;});
}
export async function addTreasuryLoan(input: Omit<TreasuryLoan, "id" | "createdAt" | "updatedAt">) {
  return mutateTreasuryStore(store=>{const now=new Date().toISOString();const loan:TreasuryLoan={...input,id:randomUUID(),currency:input.currency.toUpperCase(),principal:asMoney(input.principal),outstandingBalance:asMoney(input.outstandingBalance),interestRate:asMoney(input.interestRate),createdAt:now,updatedAt:now};store.loans.unshift(loan);return loan;});
}
export async function addTreasuryInvestment(input: Omit<TreasuryInvestment, "id" | "createdAt" | "updatedAt">) {
  return mutateTreasuryStore(store=>{const now=new Date().toISOString();const investment:TreasuryInvestment={...input,id:randomUUID(),currency:input.currency.toUpperCase(),amount:asMoney(input.amount),expectedReturnPercent:asMoney(input.expectedReturnPercent),createdAt:now,updatedAt:now};store.investments.unshift(investment);return investment;});
}
export async function addTreasuryForecastItem(input: Omit<TreasuryForecastItem, "id" | "createdAt" | "updatedAt">) {
  const due=new Date(input.dueDate);if(Number.isNaN(due.getTime()))throw new Error("Invalid forecast due date");
  return mutateTreasuryStore(store=>{const now=new Date().toISOString();const item:TreasuryForecastItem={...input,id:randomUUID(),label:input.label.trim().slice(0,160),amount:asMoney(input.amount),currency:input.currency.toUpperCase(),dueDate:due.toISOString(),category:input.category.trim().slice(0,80)||"OTHER",note:input.note.trim().slice(0,500),createdAt:now,updatedAt:now};if(item.amount<=0)throw new Error("Forecast amount must be greater than zero");store.forecastItems.unshift(item);store.forecastItems=store.forecastItems.slice(0,5000);return item;});
}
export async function updateTreasuryForecastStatus(id: string, status: TreasuryForecastStatus) {
  return mutateTreasuryStore(store=>{const item=store.forecastItems.find(f=>f.id===id);if(!item)throw new Error("Forecast item not found");item.status=status;item.updatedAt=new Date().toISOString();return item;});
}
export async function addProjectIntegration(input: { code: string; name: string; country: string; currency: string; caseId: string | null; apiKey: string }) {
  return mutateTreasuryStore(store=>{if(store.integrations.some(i=>i.code.toLowerCase()===input.code.toLowerCase()))throw new Error("Project code already exists");const now=new Date().toISOString();const integration:ProjectIntegration={id:randomUUID(),code:input.code.trim(),name:input.name.trim(),country:input.country.trim(),currency:input.currency.toUpperCase(),caseId:input.caseId,apiKeyHash:sha256(input.apiKey),enabled:true,lastSyncAt:null,lastExternalId:null,createdAt:now,updatedAt:now};store.integrations.unshift(integration);return integration;});
}

export async function ingestProjectCashflow(input: { projectCode: string; apiKey: string; externalId: string; direction: TreasuryDirection; category: string; amount: number; currency: string; occurredAt: string; description: string; accountId?: string | null }) {
  if(!input.externalId.trim())throw new Error("externalId is required");
  const amount=asMoney(input.amount);if(amount<=0)throw new Error("amount must be greater than zero");
  const occurredAt=new Date(input.occurredAt);if(Number.isNaN(occurredAt.getTime()))throw new Error("Invalid occurredAt");
  return mutateTreasuryStore(store=>{
    const integration=store.integrations.find(i=>i.enabled&&i.code===input.projectCode);if(!integration)throw new Error("Unknown project integration");
    if(integration.apiKeyHash!==sha256(input.apiKey))throw new Error("Invalid project API key");
    const externalId=input.externalId.trim();const existing=store.projectCashflows.find(t=>t.integrationId===integration.id&&t.externalId===externalId);if(existing)return{transaction:existing,duplicate:true};
    const currency=input.currency.toUpperCase();if(currency!==integration.currency)throw new Error(`Currency mismatch: expected ${integration.currency}`);
    const now=new Date().toISOString();const tx:ProjectCashflow={id:randomUUID(),integrationId:integration.id,externalId,direction:input.direction,category:input.category.trim().slice(0,100)||"OTHER",amount,currency,occurredAt:occurredAt.toISOString(),description:input.description.trim().slice(0,500),accountId:input.accountId||null,createdAt:now};
    if(tx.accountId){const account=store.accounts.find(a=>a.id===tx.accountId);if(!account)throw new Error("Treasury account not found");if(account.currency!==tx.currency)throw new Error(`Account currency mismatch: expected ${account.currency}`);account.balance=round(account.balance+(tx.direction==="IN"?tx.amount:-tx.amount));account.updatedAt=now;}
    store.projectCashflows.unshift(tx);integration.lastSyncAt=now;integration.lastExternalId=tx.externalId;integration.updatedAt=now;return{transaction:tx,duplicate:false};
  });
}

export async function ingestTreasuryAccountSync(input: { accountId: string; apiKey: string; externalId: string; balance: number; currency: string; capturedAt?: string | null; note?: string }) {
  if(!input.externalId.trim())throw new Error("externalId is required");
  const captured=input.capturedAt?new Date(input.capturedAt):new Date();if(Number.isNaN(captured.getTime()))throw new Error("Invalid capturedAt");
  const reportedBalance=asMoney(input.balance);const externalId=input.externalId.trim();
  return mutateTreasuryStore(store=>{
    const account=store.accounts.find(a=>a.id===input.accountId&&a.active);if(!account)throw new Error("Unknown treasury account");
    if(account.connectionMode!=="CONNECTED"||!account.connectionKeyHash)throw new Error("Account API connection is not configured");
    if(account.connectionKeyHash!==sha256(input.apiKey.trim()))throw new Error("Invalid account API key");
    const duplicate=store.accountSnapshots.find(s=>s.accountId===account.id&&s.externalId===externalId);if(duplicate)return{snapshot:duplicate,duplicate:true,reconciliation:null};
    const currency=input.currency.toUpperCase();if(currency!==account.currency)throw new Error(`Currency mismatch: expected ${account.currency}`);
    const expectedBalance=account.balance;const difference=round(reportedBalance-expectedBalance);const previousSnapshot=store.accountSnapshots.find(s=>s.accountId===account.id)||null;const now=new Date().toISOString();
    account.balance=reportedBalance;account.lastSyncAt=captured.toISOString();account.lastExternalSyncId=externalId;account.updatedAt=now;
    const snapshot=pushSnapshot(store,account,"PROVIDER",externalId,captured.toISOString());
    const reconciliation:TreasuryReconciliation={id:randomUUID(),accountId:account.id,expectedBalance,reportedBalance,difference,status:Math.abs(difference)<0.01?"MATCHED":"REVIEW",periodStart:previousSnapshot?.capturedAt||null,periodEnd:captured.toISOString(),note:String(input.note||"").slice(0,500),createdAt:now,resolvedAt:null};
    store.reconciliations.unshift(reconciliation);store.reconciliations=store.reconciliations.slice(0,5000);return{snapshot,duplicate:false,reconciliation};
  });
}
export async function resolveTreasuryReconciliation(id: string, note: string) {
  return mutateTreasuryStore(store=>{const row=store.reconciliations.find(r=>r.id===id);if(!row)throw new Error("Reconciliation not found");if(row.status==="RESOLVED")return row;row.status="RESOLVED";row.resolvedAt=new Date().toISOString();row.note=[row.note,note.trim()].filter(Boolean).join(" · ").slice(0,500);return row;});
}

export function treasuryByCurrency(store: TreasuryStore) {
  const currencies = new Set<string>(); store.accounts.forEach(a => currencies.add(a.currency)); store.sources.forEach(s => currencies.add(s.currency)); store.loans.forEach(l => currencies.add(l.currency)); store.investments.forEach(i => currencies.add(i.currency)); store.projectCashflows.forEach(t => currencies.add(t.currency)); store.forecastItems.forEach(f=>currencies.add(f.currency));
  return Array.from(currencies).sort().map(currency => {
    const cash = round(store.accounts.filter(a => a.active && a.currency === currency).reduce((s,a) => s + a.balance, 0));
    const projectIn = round(store.projectCashflows.filter(t => t.currency === currency && t.direction === "IN").reduce((s,t) => s + t.amount, 0));
    const projectOut = round(store.projectCashflows.filter(t => t.currency === currency && t.direction === "OUT").reduce((s,t) => s + t.amount, 0));
    const projectProfit = round(projectIn - projectOut);
    const loanOutstanding = round(store.loans.filter(l => l.currency === currency && l.status === "ACTIVE").reduce((s,l) => s + l.outstandingBalance, 0));
    const invested = round(store.investments.filter(i => i.currency === currency && i.status !== "CANCELLED").reduce((s,i) => s + i.amount, 0));
    return { currency, cash, projectIn, projectOut, projectProfit, loanOutstanding, invested };
  });
}

export function projectPerformance(store: TreasuryStore) {
  return store.integrations.map(integration => {
    const rows = store.projectCashflows.filter(t => t.integrationId === integration.id);
    const income = round(rows.filter(t => t.direction === "IN").reduce((s,t) => s + t.amount, 0));
    const expense = round(rows.filter(t => t.direction === "OUT").reduce((s,t) => s + t.amount, 0));
    const profit = round(income - expense); const margin = income > 0 ? round(profit / income * 100) : null;
    return { ...integration, income, expense, profit, margin, transactionCount: rows.length };
  });
}

export function treasuryReconciliationSummary(store: TreasuryStore) {
  const review = store.reconciliations.filter(r => r.status === "REVIEW");
  const matched = store.reconciliations.filter(r => r.status === "MATCHED");
  const resolved = store.reconciliations.filter(r => r.status === "RESOLVED");
  return { reviewCount: review.length, matchedCount: matched.length, resolvedCount: resolved.length, recent: store.reconciliations.slice(0,50) };
}

export function companyWealthByCurrency(store: TreasuryStore) {
  return treasuryByCurrency(store).map(row => {
    const activeInvestments = round(store.investments.filter(i => i.currency === row.currency && i.status === "ACTIVE").reduce((s,i)=>s+i.amount,0));
    const partnerCapital = round(store.partners.filter(p=>p.currency===row.currency&&p.status==="ACTIVE").reduce((s,p)=>s+p.capitalContributed,0));
    const assets = round(row.cash + activeInvestments);
    const liabilities = row.loanOutstanding;
    const netWorth = round(assets - liabilities);
    const debtToAssetsPercent = assets > 0 ? round(liabilities / assets * 100) : liabilities > 0 ? null : 0;
    return { currency: row.currency, cash: row.cash, investments: activeInvestments, assets, liabilities, netWorth, partnerCapital, projectProfit: row.projectProfit, debtToAssetsPercent };
  });
}

export function partnerEconomics(store: TreasuryStore) {
  const profits = new Map<string,number>();
  for (const row of treasuryByCurrency(store)) profits.set(row.currency,row.projectProfit);
  return store.partners.filter(p=>p.status==="ACTIVE").map(partner=>{
    const currencyProfit=profits.get(partner.currency)||0;
    const theoreticalProfitShare=round(Math.max(0,currencyProfit)*partner.profitSharePercent/100);
    return {...partner,theoreticalProfitShare,totalEconomicExposure:round(partner.capitalContributed+theoreticalProfitShare)};
  });
}

export function cashForecastByCurrency(store: TreasuryStore, now = new Date()) {
  const currencies = new Set(treasuryByCurrency(store).map(r=>r.currency));
  store.forecastItems.forEach(f=>currencies.add(f.currency));
  const horizons = [30,60,90] as const;
  return Array.from(currencies).sort().map(currency=>{
    const openingCash=round(store.accounts.filter(a=>a.active&&a.currency===currency).reduce((s,a)=>s+a.balance,0));
    const rows = horizons.map(days=>{
      const end = new Date(now.getTime()+days*24*60*60*1000);
      const planned = store.forecastItems.filter(f=>f.currency===currency&&!["PAID","CANCELLED"].includes(f.status)&&new Date(f.dueDate)>=now&&new Date(f.dueDate)<=end);
      const plannedIn=round(planned.filter(f=>f.direction==="IN").reduce((s,f)=>s+f.amount,0));
      const plannedOut=round(planned.filter(f=>f.direction==="OUT").reduce((s,f)=>s+f.amount,0));
      const loanDue=round(store.loans.filter(l=>l.currency===currency&&l.status==="ACTIVE"&&l.dueDate&&new Date(l.dueDate)>=now&&new Date(l.dueDate)<=end).reduce((s,l)=>s+l.outstandingBalance,0));
      const futureInvestments=round(store.investments.filter(i=>i.currency===currency&&i.status==="PLANNED"&&i.investedAt&&new Date(i.investedAt)>=now&&new Date(i.investedAt)<=end).reduce((s,i)=>s+i.amount,0));
      const projectedCash=round(openingCash+plannedIn-plannedOut-loanDue-futureInvestments);
      return { days, plannedIn, plannedOut, loanDue, futureInvestments, projectedCash, risk: projectedCash < 0 ? "CRITICAL" as const : projectedCash < openingCash*0.2 ? "WATCH" as const : "HEALTHY" as const };
    });
    return {currency,openingCash,horizons:rows};
  });
}

export function monthlyTreasuryDashboard(store: TreasuryStore, now = new Date(), months = 12) {
  const integrations = new Map(store.integrations.map(i=>[i.id,i]));
  const currencies = new Set(treasuryByCurrency(store).map(r=>r.currency));
  return Array.from(currencies).sort().map(currency=>{
    const rows = Array.from({length:months},(_,offset)=>{
      const d = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-offset,1));
      const next = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));
      const cashflows=store.projectCashflows.filter(t=>t.currency===currency&&new Date(t.occurredAt)>=d&&new Date(t.occurredAt)<next);
      const income=round(cashflows.filter(t=>t.direction==="IN").reduce((s,t)=>s+t.amount,0));
      const expense=round(cashflows.filter(t=>t.direction==="OUT").reduce((s,t)=>s+t.amount,0));
      const profit=round(income-expense);
      const activeProjects=new Set(cashflows.map(t=>integrations.get(t.integrationId)?.id).filter((v):v is string=>Boolean(v))).size;
      return {month:d.toISOString().slice(0,7),income,expense,profit,activeProjects,margin:income>0?round(profit/income*100):null};
    }).reverse();
    return {currency,months:rows};
  });
}

export function cashBurnAndRunway(store: TreasuryStore, now = new Date()) {
  const since = new Date(now.getTime()-90*24*60*60*1000);
  return treasuryByCurrency(store).map(row=>{
    const out90=round(store.projectCashflows.filter(t=>t.currency===row.currency&&t.direction==="OUT"&&new Date(t.occurredAt)>=since&&new Date(t.occurredAt)<=now).reduce((s,t)=>s+t.amount,0));
    const monthlyBurn=round(out90/3);
    const runwayMonths=monthlyBurn>0?round(row.cash/monthlyBurn):null;
    return {currency:row.currency,cash:row.cash,out90,monthlyBurn,runwayMonths,status:runwayMonths===null?"NO_DATA" as const:runwayMonths<2?"CRITICAL" as const:runwayMonths<4?"WATCH" as const:"HEALTHY" as const};
  });
}

export function profitabilityByCountry(store: TreasuryStore) {
  const integrationMap=new Map(store.integrations.map(i=>[i.id,i]));
  const bucket=new Map<string,{country:string;currency:string;income:number;expense:number;projects:Set<string>}>();
  for(const tx of store.projectCashflows){
    const integration=integrationMap.get(tx.integrationId); if(!integration)continue;
    const key=`${integration.country||"Non défini"}::${tx.currency}`;
    const row=bucket.get(key)||{country:integration.country||"Non défini",currency:tx.currency,income:0,expense:0,projects:new Set<string>()};
    if(tx.direction==="IN")row.income+=tx.amount;else row.expense+=tx.amount;
    row.projects.add(integration.id);bucket.set(key,row);
  }
  return Array.from(bucket.values()).map(row=>{const income=round(row.income),expense=round(row.expense),profit=round(income-expense);return{country:row.country,currency:row.currency,income,expense,profit,margin:income>0?round(profit/income*100):null,projectCount:row.projects.size};}).sort((a,b)=>b.profit-a.profit);
}

export function accountConcentration(store: TreasuryStore) {
  const rows: Array<{accountId:string;name:string;institution:string;country:string;currency:string;balance:number;sharePercent:number;risk:"HIGH"|"WATCH"|"NORMAL"}> = [];
  for(const currency of new Set(store.accounts.filter(a=>a.active).map(a=>a.currency))){
    const accounts=store.accounts.filter(a=>a.active&&a.currency===currency); const total=accounts.reduce((s,a)=>s+a.balance,0);
    for(const account of accounts){const sharePercent=total>0?round(account.balance/total*100):0;rows.push({accountId:account.id,name:account.name,institution:account.institution,country:account.country,currency,balance:account.balance,sharePercent,risk:sharePercent>=70?"HIGH":sharePercent>=50?"WATCH":"NORMAL"});}
  }
  return rows.sort((a,b)=>b.sharePercent-a.sharePercent);
}

export function loanMaturitySchedule(store: TreasuryStore, now = new Date()) {
  return store.loans.filter(l=>l.status==="ACTIVE").map(loan=>{
    const due=loan.dueDate?new Date(loan.dueDate):null; const valid=due&&!Number.isNaN(due.getTime());
    const daysUntilDue=valid?Math.ceil((due!.getTime()-now.getTime())/(24*60*60*1000)):null;
    const annualInterest=round(loan.outstandingBalance*loan.interestRate/100);
    const severity=daysUntilDue===null?"NO_DATE" as const:daysUntilDue<0?"OVERDUE" as const:daysUntilDue<=30?"DUE_SOON" as const:daysUntilDue<=90?"WATCH" as const:"NORMAL" as const;
    return {...loan,daysUntilDue,annualInterest,severity};
  }).sort((a,b)=>(a.daysUntilDue??999999)-(b.daysUntilDue??999999));
}

export function executiveTreasuryAlerts(store: TreasuryStore, now = new Date()) {
  const alerts: Array<{id:string;severity:"CRITICAL"|"WARNING"|"INFO";title:string;detail:string;currency?:string}> = [];
  for(const a of store.accounts.filter(a=>a.active&&a.dailyUpdateRequired&&(!a.lastSyncAt||now.getTime()-new Date(a.lastSyncAt).getTime()>36*60*60*1000))) alerts.push({id:`stale-${a.id}`,severity:"WARNING",title:"Compte non mis à jour",detail:`${a.name} · ${a.country} · dernière synchronisation ${a.lastSyncAt||"jamais"}`,currency:a.currency});
  for(const r of store.reconciliations.filter(r=>r.status==="REVIEW").slice(0,20)){const a=store.accounts.find(x=>x.id===r.accountId);alerts.push({id:`rec-${r.id}`,severity:"CRITICAL",title:"Écart de réconciliation",detail:`${a?.name||"Compte"} · différence ${r.difference}`,currency:a?.currency});}
  for(const f of cashForecastByCurrency(store,now)) for(const h of f.horizons.filter(h=>h.risk!=="HEALTHY")) alerts.push({id:`forecast-${f.currency}-${h.days}`,severity:h.risk==="CRITICAL"?"CRITICAL":"WARNING",title:`Trésorerie ${h.days} jours`,detail:`Cash projeté ${h.projectedCash}`,currency:f.currency});
  for(const c of accountConcentration(store).filter(c=>c.risk!=="NORMAL")) alerts.push({id:`conc-${c.accountId}`,severity:c.risk==="HIGH"?"CRITICAL":"WARNING",title:"Concentration bancaire",detail:`${c.sharePercent}% des liquidités ${c.currency} sont sur ${c.name}`,currency:c.currency});
  for(const l of loanMaturitySchedule(store,now).filter(l=>["OVERDUE","DUE_SOON"].includes(l.severity))) alerts.push({id:`loan-${l.id}`,severity:l.severity==="OVERDUE"?"CRITICAL":"WARNING",title:l.severity==="OVERDUE"?"Prêt en retard":"Prêt à échéance proche",detail:`${l.lender} · solde ${l.outstandingBalance} · ${l.daysUntilDue} jour(s)`,currency:l.currency});
  for(const p of projectPerformance(store).filter(p=>p.profit<0)) alerts.push({id:`project-${p.id}`,severity:"WARNING",title:"Projet déficitaire",detail:`${p.name} · profit ${p.profit}`,currency:p.currency});
  return alerts.sort((a,b)=>({CRITICAL:0,WARNING:1,INFO:2}[a.severity]-{CRITICAL:0,WARNING:1,INFO:2}[b.severity]));
}
