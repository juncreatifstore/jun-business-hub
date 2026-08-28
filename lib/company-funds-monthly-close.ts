import "server-only";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTreasuryStore } from "@/lib/company-funds";
import { getFinancialReserveDashboard } from "@/lib/company-funds-reserves";
import { buildCompanyFinanceEntries } from "@/lib/company-funds-finance-sync";
import { assertFinancialMonthReadyToClose } from "@/lib/company-funds-monthly-close-validation";

const PREFIX = "company.funds.month-close.";
const REVISION_PREFIX = "company.funds.month-close-revision.";

export type MonthCloseStatus = "CLOSED" | "REOPENED";
export type MonthlyCloseAccountBalanceSource = "SNAPSHOT_MANUAL" | "SNAPSHOT_PROVIDER" | "ACCOUNT_LAST_KNOWN";

export type MonthlyCloseSnapshot = {
  accounts: Array<{
    id: string;
    name: string;
    country: string;
    institution: string;
    currency: string;
    balance: number;
    balanceAsOf?: string | null;
    balanceSource?: MonthlyCloseAccountBalanceSource | null;
    snapshotId?: string | null;
  }>;
  reserves: Array<{ id: string; name: string; kind: string; country: string | null; currency: string; targetAmount: number; reservedAmount: number }>;
  loans: Array<{ id: string; lender: string; currency: string; principal: number; outstandingBalance: number; interestRate: number; dueDate: string; status: string }>;
  investments: Array<{ id: string; name: string; country: string; currency: string; amount: number; status: string }>;
  financeByCurrency: Array<{ currency: string; income: number; refunds: number; expenses: number; fees: number; net: number; entryCount: number }>;
};

export type MonthlyCloseIntegrity = {
  algorithm: "SHA-256";
  snapshotHash: string;
  previousHash: string | null;
  chainHash: string;
};

export type MonthlyFinancialClose = {
  id: string;
  period: string;
  status: MonthCloseStatus;
  revision: number;
  closedAt: string;
  closedById: string;
  closeNote: string;
  reopenedAt: string | null;
  reopenedById: string | null;
  reopenReason: string | null;
  snapshot: MonthlyCloseSnapshot;
  integrity?: MonthlyCloseIntegrity | null;
};

export type MonthlyCloseRevision = {
  id: string;
  period: string;
  revision: number;
  event: "CLOSED" | "REOPENED";
  recordedAt: string;
  recordedById: string;
  reason: string;
  snapshot: MonthlyCloseSnapshot;
  status: MonthCloseStatus;
  integrity?: MonthlyCloseIntegrity | null;
};

export type MonthlyCloseVariance = {
  currency: string;
  income: number;
  refunds: number;
  expenses: number;
  fees: number;
  net: number;
  entryCount: number;
};

export type MonthlyCloseIntegrityCheck = {
  status: "VERIFIED" | "LEGACY" | "BROKEN";
  checked: number;
  verified: number;
  legacy: number;
  broken: number;
  latestHash: string | null;
  issues: string[];
};

function key(period: string) { return `${PREFIX}${period}`; }
function revisionKey(period: string, revision: number, event: string) {
  return `${REVISION_PREFIX}${period}.${String(revision).padStart(4, "0")}.${event.toLowerCase()}.${randomUUID()}`;
}
function validPeriod(period: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(period); }
function round(value: number) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
function validTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
function hash(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function normalizeClose(value: MonthlyFinancialClose): MonthlyFinancialClose {
  return { ...value, revision: Math.max(1, Number(value.revision || 1)), integrity: value.integrity || null };
}
function parse(value: string): MonthlyFinancialClose | null {
  try {
    const parsed = JSON.parse(value) as MonthlyFinancialClose;
    return parsed?.id && validPeriod(parsed.period) && parsed.snapshot ? normalizeClose(parsed) : null;
  } catch { return null; }
}
function parseRevision(value: string): MonthlyCloseRevision | null {
  try {
    const parsed = JSON.parse(value) as MonthlyCloseRevision;
    return parsed?.id && validPeriod(parsed.period) && parsed.snapshot ? { ...parsed, integrity: parsed.integrity || null } : null;
  } catch { return null; }
}

export function periodBounds(period: string) {
  if (!validPeriod(period)) throw new Error("Invalid closing period");
  const [year, month] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

export async function listMonthlyFinancialCloses() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: PREFIX, not: { startsWith: REVISION_PREFIX } } },
    orderBy: { key: "desc" },
    take: 240,
    select: { value: true },
  });
  return rows.map((row) => parse(row.value)).filter((value): value is MonthlyFinancialClose => Boolean(value));
}

export async function getMonthlyFinancialClose(period: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: key(period) }, select: { value: true } });
  return row ? parse(row.value) : null;
}

export async function listMonthlyCloseRevisions(period: string) {
  if (!validPeriod(period)) throw new Error("Invalid closing period");
  const rows = await prisma.appSetting.findMany({
    where: { key: { startsWith: `${REVISION_PREFIX}${period}.` } },
    orderBy: { updatedAt: "asc" },
    take: 500,
    select: { value: true },
  });
  return rows.map((row) => parseRevision(row.value)).filter((value): value is MonthlyCloseRevision => Boolean(value)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function isFinancialPeriodClosed(date: Date | string) {
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid financial date");
  const period = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  const close = await getMonthlyFinancialClose(period);
  return Boolean(close && close.status === "CLOSED");
}

export async function assertFinancialPeriodOpen(date: Date | string) {
  if (await isFinancialPeriodClosed(date)) throw new Error("Financial period is closed. Reopen the month before posting a historical correction.");
}

function historicalAccountRows(treasury: Awaited<ReturnType<typeof getTreasuryStore>>, end: Date): MonthlyCloseSnapshot["accounts"] {
  const endTime = end.getTime();
  const rows: MonthlyCloseSnapshot["accounts"] = [];
  const missing: string[] = [];

  for (const account of treasury.accounts) {
    const createdAt = validTime(account.createdAt);
    if (createdAt !== null && createdAt >= endTime) continue;

    const snapshots = treasury.accountSnapshots
      .filter((snapshot) => snapshot.accountId === account.id)
      .map((snapshot) => ({ snapshot, time: validTime(snapshot.capturedAt) }))
      .filter((row): row is { snapshot: (typeof treasury.accountSnapshots)[number]; time: number } => row.time !== null && row.time < endTime)
      .sort((a, b) => b.time - a.time);

    const latest = snapshots[0];
    if (latest) {
      rows.push({
        id: account.id,
        name: account.name,
        country: account.country,
        institution: account.institution,
        currency: account.currency,
        balance: round(latest.snapshot.balance),
        balanceAsOf: latest.snapshot.capturedAt,
        balanceSource: latest.snapshot.source === "PROVIDER" ? "SNAPSHOT_PROVIDER" : "SNAPSHOT_MANUAL",
        snapshotId: latest.snapshot.id,
      });
      continue;
    }

    const updatedAt = validTime(account.updatedAt);
    if (updatedAt !== null && updatedAt < endTime) {
      rows.push({
        id: account.id,
        name: account.name,
        country: account.country,
        institution: account.institution,
        currency: account.currency,
        balance: round(account.balance),
        balanceAsOf: account.updatedAt,
        balanceSource: "ACCOUNT_LAST_KNOWN",
        snapshotId: null,
      });
      continue;
    }

    missing.push(`${account.name} (${account.currency})`);
  }

  if (missing.length) {
    throw new Error(`Clôture impossible: aucun solde historique fiable avant la fin de période pour ${missing.join(", ")}. Synchronisez ou documentez le compte avant de clôturer.`);
  }
  return rows;
}

async function buildSnapshot(period: string): Promise<MonthlyCloseSnapshot> {
  const [{ start, end }, treasury, reserves, entries] = await Promise.all([
    Promise.resolve(periodBounds(period)),
    getTreasuryStore(),
    getFinancialReserveDashboard(),
    buildCompanyFinanceEntries(),
  ]);

  const monthEntries = entries.filter((entry) => {
    const time = new Date(entry.occurredAt).getTime();
    return time >= start.getTime() && time < end.getTime();
  });
  const currencies = [...new Set(monthEntries.map((entry) => entry.currency))].sort();
  const financeByCurrency = currencies.map((currency) => {
    const rows = monthEntries.filter((entry) => entry.currency === currency);
    const income = round(rows.filter((entry) => entry.sourceType === "PAYMENT").reduce((sum, entry) => sum + entry.amount, 0));
    const refunds = round(rows.filter((entry) => entry.sourceType === "REFUND").reduce((sum, entry) => sum + entry.amount, 0));
    const expenses = round(rows.filter((entry) => entry.sourceType === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0));
    const fees = round(rows.filter((entry) => entry.sourceType === "PAYMENT_FEE").reduce((sum, entry) => sum + entry.amount, 0));
    return { currency, income, refunds, expenses, fees, net: round(income - refunds - expenses - fees), entryCount: rows.length };
  });

  return {
    accounts: historicalAccountRows(treasury, end),
    reserves: reserves.active.map((reserve) => ({
      id: reserve.id, name: reserve.name, kind: reserve.kind, country: reserve.country, currency: reserve.currency,
      targetAmount: round(reserve.targetAmount), reservedAmount: round(reserve.reservedAmount),
    })),
    loans: treasury.loans.map((loan) => ({
      id: loan.id, lender: loan.lender, currency: loan.currency, principal: round(loan.principal),
      outstandingBalance: round(loan.outstandingBalance), interestRate: loan.interestRate, dueDate: loan.dueDate, status: loan.status,
    })),
    investments: treasury.investments.map((investment) => ({
      id: investment.id, name: investment.name, country: investment.country, currency: investment.currency,
      amount: round(investment.amount), status: investment.status,
    })),
    financeByCurrency,
  };
}

async function archiveRevision(row: MonthlyFinancialClose, event: "CLOSED" | "REOPENED", userId: string, reason: string) {
  const existing = await listMonthlyCloseRevisions(row.period);
  const previousHash = [...existing].reverse().find((revision) => revision.integrity?.chainHash)?.integrity?.chainHash || null;
  const recordedAt = new Date().toISOString();
  const snapshotHash = hash(row.snapshot);
  const normalizedReason = reason.trim().slice(0, 2000);
  const payload = { period: row.period, revision: row.revision, event, recordedAt, recordedById: userId, reason: normalizedReason, snapshotHash, previousHash, status: row.status };
  const integrity: MonthlyCloseIntegrity = { algorithm: "SHA-256", snapshotHash, previousHash, chainHash: hash(payload) };
  const revision: MonthlyCloseRevision = {
    id: randomUUID(), period: row.period, revision: row.revision, event, recordedAt, recordedById: userId,
    reason: normalizedReason, snapshot: row.snapshot, status: row.status, integrity,
  };
  await prisma.appSetting.create({ data: { key: revisionKey(row.period, row.revision, event), value: JSON.stringify(revision) } });
  return revision;
}

export function compareMonthlyCloseSnapshots(before: MonthlyCloseSnapshot, after: MonthlyCloseSnapshot): MonthlyCloseVariance[] {
  const currencies = [...new Set([...before.financeByCurrency.map((row) => row.currency), ...after.financeByCurrency.map((row) => row.currency)])].sort();
  return currencies.map((currency) => {
    const previous = before.financeByCurrency.find((row) => row.currency === currency);
    const current = after.financeByCurrency.find((row) => row.currency === currency);
    return {
      currency,
      income: round((current?.income || 0) - (previous?.income || 0)),
      refunds: round((current?.refunds || 0) - (previous?.refunds || 0)),
      expenses: round((current?.expenses || 0) - (previous?.expenses || 0)),
      fees: round((current?.fees || 0) - (previous?.fees || 0)),
      net: round((current?.net || 0) - (previous?.net || 0)),
      entryCount: (current?.entryCount || 0) - (previous?.entryCount || 0),
    };
  });
}

export async function verifyMonthlyCloseIntegrity(period: string): Promise<MonthlyCloseIntegrityCheck> {
  const revisions = await listMonthlyCloseRevisions(period);
  let previousHash: string | null = null;
  let verified = 0;
  let legacy = 0;
  let broken = 0;
  const issues: string[] = [];
  for (const revision of revisions) {
    if (!revision.integrity) { legacy += 1; continue; }
    const snapshotHash = hash(revision.snapshot);
    const payload = {
      period: revision.period, revision: revision.revision, event: revision.event, recordedAt: revision.recordedAt,
      recordedById: revision.recordedById, reason: revision.reason, snapshotHash,
      previousHash: revision.integrity.previousHash, status: revision.status,
    };
    const chainHash = hash(payload);
    const valid = snapshotHash === revision.integrity.snapshotHash && revision.integrity.previousHash === previousHash && chainHash === revision.integrity.chainHash;
    if (valid) verified += 1;
    else { broken += 1; issues.push(`Révision ${revision.revision} ${revision.event}: empreinte invalide`); }
    previousHash = revision.integrity.chainHash;
  }
  return {
    status: broken > 0 ? "BROKEN" : legacy > 0 ? "LEGACY" : "VERIFIED",
    checked: revisions.length, verified, legacy, broken, latestHash: previousHash, issues,
  };
}

export async function getMonthlyCloseRevisionSummary(period: string) {
  const [current, revisions, integrity] = await Promise.all([
    getMonthlyFinancialClose(period), listMonthlyCloseRevisions(period), verifyMonthlyCloseIntegrity(period),
  ]);
  const previousClosed = [...revisions].reverse().find((revision) => revision.event === "CLOSED" && revision.revision < (current?.revision || 0));
  const variance = current && previousClosed && current.revision > previousClosed.revision ? compareMonthlyCloseSnapshots(previousClosed.snapshot, current.snapshot) : [];
  return { current, revisions, previousClosed, variance, integrity };
}

export async function closeFinancialMonth(period: string, userId: string, note: string) {
  if (!validPeriod(period)) throw new Error("Invalid closing period");
  const existing = await getMonthlyFinancialClose(period);
  if (existing?.status === "CLOSED") throw new Error("This month is already closed");
  const { end } = periodBounds(period);
  if (end.getTime() > Date.now()) throw new Error("A future month cannot be closed");
  await assertFinancialMonthReadyToClose(period);

  const now = new Date().toISOString();
  const snapshot = await buildSnapshot(period);
  const revision = existing ? existing.revision + 1 : 1;
  const row: MonthlyFinancialClose = {
    id: existing?.id || randomUUID(), period, status: "CLOSED", revision, closedAt: now, closedById: userId,
    closeNote: note.trim().slice(0, 2000), reopenedAt: null, reopenedById: null, reopenReason: null, snapshot, integrity: null,
  };
  await prisma.appSetting.upsert({ where: { key: key(period) }, create: { key: key(period), value: JSON.stringify(row) }, update: { value: JSON.stringify(row) } });
  const archived = await archiveRevision(row, "CLOSED", userId, row.closeNote || `Clôture révision ${revision}`);
  row.integrity = archived.integrity || null;
  await prisma.appSetting.update({ where: { key: key(period) }, data: { value: JSON.stringify(row) } });
  return row;
}

export async function reopenFinancialMonth(period: string, userId: string, reason: string) {
  const row = await getMonthlyFinancialClose(period);
  if (!row || row.status !== "CLOSED") throw new Error("This financial month is not closed");
  if (reason.trim().length < 10) throw new Error("A detailed reopening reason is required");
  const archived = await archiveRevision(row, "REOPENED", userId, reason);
  row.status = "REOPENED";
  row.reopenedAt = new Date().toISOString();
  row.reopenedById = userId;
  row.reopenReason = reason.trim().slice(0, 2000);
  row.integrity = archived.integrity || null;
  await prisma.appSetting.update({ where: { key: key(period) }, data: { value: JSON.stringify(row) } });
  return row;
}
