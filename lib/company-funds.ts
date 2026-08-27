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
export type TreasuryStore = {
  accounts: TreasuryAccount[]; sources: TreasurySource[]; partners: TreasuryPartner[]; loans: TreasuryLoan[];
  investments: TreasuryInvestment[]; integrations: ProjectIntegration[]; projectCashflows: ProjectCashflow[];
  accountSnapshots: TreasuryAccountSnapshot[]; reconciliations: TreasuryReconciliation[]; updatedAt: string;
};

const emptyStore = (): TreasuryStore => ({ accounts: [], sources: [], partners: [], loans: [], investments: [], integrations: [], projectCashflows: [], accountSnapshots: [], reconciliations: [], updatedAt: new Date().toISOString() });
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
    updatedAt: String(r.updatedAt || new Date().toISOString()),
  };
}

export async function getTreasuryStore() {
  const row = await prisma.appSetting.findUnique({ where: { key: STORE_KEY }, select: { value: true } });
  if (!row) return emptyStore();
  try { return normalizeStore(JSON.parse(row.value)); } catch { return emptyStore(); }
}
export async function saveTreasuryStore(store: TreasuryStore) {
  const normalized = { ...store, updatedAt: new Date().toISOString() };
  await prisma.appSetting.upsert({ where: { key: STORE_KEY }, create: { key: STORE_KEY, value: JSON.stringify(normalized) }, update: { value: JSON.stringify(normalized) } });
  return normalized;
}

function pushSnapshot(store: TreasuryStore, account: TreasuryAccount, source: "MANUAL" | "PROVIDER", externalId: string | null, capturedAt: string) {
  const snapshot: TreasuryAccountSnapshot = { id: randomUUID(), accountId: account.id, balance: account.balance, source, externalId, capturedAt, createdAt: new Date().toISOString() };
  store.accountSnapshots.unshift(snapshot);
  store.accountSnapshots = store.accountSnapshots.slice(0, 10000);
  return snapshot;
}

export async function addTreasuryAccount(input: Omit<TreasuryAccount, "id" | "createdAt" | "updatedAt" | "lastSyncAt">) {
  const store = await getTreasuryStore(); const now = new Date().toISOString();
  const account: TreasuryAccount = { ...input, id: randomUUID(), currency: input.currency.toUpperCase(), balance: asMoney(input.balance), connectionKeyHash: input.connectionKeyHash || null, lastExternalSyncId: null, lastSyncAt: input.connectionMode === "MANUAL" ? now : null, createdAt: now, updatedAt: now };
  store.accounts.unshift(account); if (account.connectionMode === "MANUAL") pushSnapshot(store, account, "MANUAL", null, now); await saveTreasuryStore(store); return account;
}
export async function updateTreasuryAccountBalance(id: string, balance: number) {
  const store = await getTreasuryStore(); const account = store.accounts.find(a => a.id === id); if (!account) throw new Error("Treasury account not found");
  account.balance = asMoney(balance); account.lastSyncAt = new Date().toISOString(); account.updatedAt = account.lastSyncAt; pushSnapshot(store, account, "MANUAL", null, account.lastSyncAt); await saveTreasuryStore(store); return account;
}
export async function setTreasuryAccountConnectionKey(id: string, apiKey: string) {
  if (apiKey.trim().length < 20) throw new Error("Connection key must contain at least 20 characters");
  const store = await getTreasuryStore(); const account = store.accounts.find(a => a.id === id); if (!account) throw new Error("Treasury account not found");
  account.connectionMode = "CONNECTED"; account.connectionKeyHash = sha256(apiKey.trim()); account.updatedAt = new Date().toISOString(); await saveTreasuryStore(store); return account;
}
export async function addTreasurySource(input: Omit<TreasurySource, "id" | "createdAt">) {
  const store = await getTreasuryStore(); const source: TreasurySource = { ...input, id: randomUUID(), currency: input.currency.toUpperCase(), amount: asMoney(input.amount), createdAt: new Date().toISOString() }; store.sources.unshift(source); await saveTreasuryStore(store); return source;
}
export async function addTreasuryPartner(input: Omit<TreasuryPartner, "id" | "createdAt" | "updatedAt">) {
  const store = await getTreasuryStore(); const now = new Date().toISOString(); const partner: TreasuryPartner = { ...input, id: randomUUID(), currency: input.currency.toUpperCase(), capitalContributed: asMoney(input.capitalContributed), ownershipPercent: asMoney(input.ownershipPercent), profitSharePercent: asMoney(input.profitSharePercent), createdAt: now, updatedAt: now }; store.partners.unshift(partner); await saveTreasuryStore(store); return partner;
}
export async function addTreasuryLoan(input: Omit<TreasuryLoan, "id" | "createdAt" | "updatedAt">) {
  const store = await getTreasuryStore(); const now = new Date().toISOString(); const loan: TreasuryLoan = { ...input, id: randomUUID(), currency: input.currency.toUpperCase(), principal: asMoney(input.principal), outstandingBalance: asMoney(input.outstandingBalance), interestRate: asMoney(input.interestRate), createdAt: now, updatedAt: now }; store.loans.unshift(loan); await saveTreasuryStore(store); return loan;
}
export async function addTreasuryInvestment(input: Omit<TreasuryInvestment, "id" | "createdAt" | "updatedAt">) {
  const store = await getTreasuryStore(); const now = new Date().toISOString(); const investment: TreasuryInvestment = { ...input, id: randomUUID(), currency: input.currency.toUpperCase(), amount: asMoney(input.amount), expectedReturnPercent: asMoney(input.expectedReturnPercent), createdAt: now, updatedAt: now }; store.investments.unshift(investment); await saveTreasuryStore(store); return investment;
}
export async function addProjectIntegration(input: { code: string; name: string; country: string; currency: string; caseId: string | null; apiKey: string }) {
  const store = await getTreasuryStore(); if (store.integrations.some(i => i.code.toLowerCase() === input.code.toLowerCase())) throw new Error("Project code already exists");
  const now = new Date().toISOString(); const integration: ProjectIntegration = { id: randomUUID(), code: input.code.trim(), name: input.name.trim(), country: input.country.trim(), currency: input.currency.toUpperCase(), caseId: input.caseId, apiKeyHash: sha256(input.apiKey), enabled: true, lastSyncAt: null, lastExternalId: null, createdAt: now, updatedAt: now }; store.integrations.unshift(integration); await saveTreasuryStore(store); return integration;
}

export async function ingestProjectCashflow(input: { projectCode: string; apiKey: string; externalId: string; direction: TreasuryDirection; category: string; amount: number; currency: string; occurredAt: string; description: string; accountId?: string | null }) {
  const store = await getTreasuryStore(); const integration = store.integrations.find(i => i.enabled && i.code === input.projectCode); if (!integration) throw new Error("Unknown project integration");
  if (integration.apiKeyHash !== sha256(input.apiKey)) throw new Error("Invalid project API key");
  if (!input.externalId.trim()) throw new Error("externalId is required");
  const existing = store.projectCashflows.find(t => t.integrationId === integration.id && t.externalId === input.externalId); if (existing) return { transaction: existing, duplicate: true };
  const amount = asMoney(input.amount); if (amount <= 0) throw new Error("amount must be greater than zero");
  const currency = input.currency.toUpperCase(); if (currency !== integration.currency) throw new Error(`Currency mismatch: expected ${integration.currency}`);
  const occurredAt = new Date(input.occurredAt); if (Number.isNaN(occurredAt.getTime())) throw new Error("Invalid occurredAt");
  const tx: ProjectCashflow = { id: randomUUID(), integrationId: integration.id, externalId: input.externalId.trim(), direction: input.direction, category: input.category.trim().slice(0,100) || "OTHER", amount, currency, occurredAt: occurredAt.toISOString(), description: input.description.trim().slice(0,500), accountId: input.accountId || null, createdAt: new Date().toISOString() };
  store.projectCashflows.unshift(tx); integration.lastSyncAt = new Date().toISOString(); integration.lastExternalId = tx.externalId; integration.updatedAt = integration.lastSyncAt;
  if (tx.accountId) { const account = store.accounts.find(a => a.id === tx.accountId && a.currency === tx.currency); if (account) { account.balance = round(account.balance + (tx.direction === "IN" ? tx.amount : -tx.amount)); account.updatedAt = integration.lastSyncAt; } }
  await saveTreasuryStore(store); return { transaction: tx, duplicate: false };
}

export async function ingestTreasuryAccountSync(input: { accountId: string; apiKey: string; externalId: string; balance: number; currency: string; capturedAt?: string | null; note?: string }) {
  const store = await getTreasuryStore(); const account = store.accounts.find(a => a.id === input.accountId && a.active); if (!account) throw new Error("Unknown treasury account");
  if (account.connectionMode !== "CONNECTED" || !account.connectionKeyHash) throw new Error("Account API connection is not configured");
  if (account.connectionKeyHash !== sha256(input.apiKey.trim())) throw new Error("Invalid account API key");
  if (!input.externalId.trim()) throw new Error("externalId is required");
  const duplicate = store.accountSnapshots.find(s => s.accountId === account.id && s.externalId === input.externalId.trim()); if (duplicate) return { snapshot: duplicate, duplicate: true, reconciliation: null };
  const currency = input.currency.toUpperCase(); if (currency !== account.currency) throw new Error(`Currency mismatch: expected ${account.currency}`);
  const reportedBalance = asMoney(input.balance); const expectedBalance = account.balance; const difference = round(reportedBalance - expectedBalance);
  const captured = input.capturedAt ? new Date(input.capturedAt) : new Date(); if (Number.isNaN(captured.getTime())) throw new Error("Invalid capturedAt");
  const previousSnapshot = store.accountSnapshots.find(s => s.accountId === account.id) || null;
  const now = new Date().toISOString(); account.balance = reportedBalance; account.lastSyncAt = captured.toISOString(); account.lastExternalSyncId = input.externalId.trim(); account.updatedAt = now;
  const snapshot = pushSnapshot(store, account, "PROVIDER", input.externalId.trim(), captured.toISOString());
  const reconciliation: TreasuryReconciliation = { id: randomUUID(), accountId: account.id, expectedBalance, reportedBalance, difference, status: Math.abs(difference) < 0.01 ? "MATCHED" : "REVIEW", periodStart: previousSnapshot?.capturedAt || null, periodEnd: captured.toISOString(), note: String(input.note || "").slice(0,500), createdAt: now, resolvedAt: null };
  store.reconciliations.unshift(reconciliation); store.reconciliations = store.reconciliations.slice(0, 5000); await saveTreasuryStore(store);
  return { snapshot, duplicate: false, reconciliation };
}
export async function resolveTreasuryReconciliation(id: string, note: string) {
  const store = await getTreasuryStore(); const row = store.reconciliations.find(r => r.id === id); if (!row) throw new Error("Reconciliation not found");
  row.status = "RESOLVED"; row.resolvedAt = new Date().toISOString(); row.note = [row.note, note.trim()].filter(Boolean).join(" · ").slice(0,500); await saveTreasuryStore(store); return row;
}

export function treasuryByCurrency(store: TreasuryStore) {
  const currencies = new Set<string>(); store.accounts.forEach(a => currencies.add(a.currency)); store.sources.forEach(s => currencies.add(s.currency)); store.loans.forEach(l => currencies.add(l.currency)); store.investments.forEach(i => currencies.add(i.currency)); store.projectCashflows.forEach(t => currencies.add(t.currency));
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
