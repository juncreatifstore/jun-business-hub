import "server-only";
import { prisma } from "@/lib/prisma";
import { listFinanceExpenses } from "@/lib/finance-expenses";
import { type ClaimDecision } from "@/lib/refund-claims";

export type MonthKey = `${number}-${string}`;
export function monthKey(d: Date): MonthKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` as MonthKey;
}
export function parseMonth(v: string | undefined): { start: Date; end: Date; key: MonthKey } {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  const now = new Date();
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(y, mo, 1));
  const end = new Date(Date.UTC(y, mo + 1, 1));
  return { start, end, key: monthKey(start) };
}

export type CurrencyLine = { currency: string; count: number; total: number };
export type MonthlyReport = {
  key: MonthKey;
  start: Date;
  end: Date;
  paymentsConfirmed: CurrencyLine[];
  paymentsByMethod: Array<{ method: string; currency: string; count: number; total: number }>;
  paymentsPending: CurrencyLine[];
  refundsPaid: CurrencyLine[];
  refundsApproved: CurrencyLine[];
  claims: {
    submitted: number;
    converted: number;
    rejected: number;
    partial: number;
    retained: Array<{ currency: string; total: number }>;
    avgDecisionDays: number | null;
  };
  paymentRequests: {
    sent: number;
    paid: number;
    open: number;
    overdue: number;
    avgConfirmDays: number | null;
  };
  expenses: CurrencyLine[];
  net: Array<{ currency: string; inflow: number; refunds: number; expenses: number; net: number }>;
  daily: Array<{ day: string; currency: string; total: number }>;
  topClients: Array<{ client: string; currency: string; total: number }>;
};

function addLine(map: Map<string, CurrencyLine>, currency: string, amount: number) {
  const cur = map.get(currency) ?? { currency, count: 0, total: 0 };
  cur.count++;
  cur.total = Math.round((cur.total + amount) * 100) / 100;
  map.set(currency, cur);
}

export async function buildMonthlyReport(monthParam?: string): Promise<MonthlyReport> {
  const { start, end, key } = parseMonth(monthParam);
  const [payments, pending, installments, refundsApproved, claims, payReqs, expensesAll] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] },
        paidAt: { gte: start, lt: end },
      },
      select: {
        amount: true,
        currency: true,
        method: true,
        paidAt: true,
        client: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.payment.findMany({
      where: { status: "PENDING", createdAt: { gte: start, lt: end } },
      select: { amount: true, currency: true },
    }),
    prisma.refundInstallment.findMany({
      where: { paidAt: { gte: start, lt: end } },
      select: { amount: true, refund: { select: { currency: true } } },
    }),
    prisma.refund.findMany({
      where: { status: { in: ["APPROVED", "PARTIALLY_PAID", "PAID"] }, updatedAt: { gte: start, lt: end } },
      select: { amount: true, currency: true },
    }),
    prisma.refundClaim.findMany({
      where: { OR: [{ submittedAt: { gte: start, lt: end } }, { decidedAt: { gte: start, lt: end } }] },
      select: {
        status: true,
        submittedAt: true,
        decidedAt: true,
        amount: true,
        currency: true,
        decision: true,
      },
    }),
    prisma.paymentRequest.findMany({
      where: {
        OR: [
          { createdAt: { gte: start, lt: end } },
          { status: { in: ["SENT", "VIEWED", "PROOF_SUBMITTED"] } },
        ],
      },
      select: {
        status: true,
        createdAt: true,
        dueAt: true,
        proof: true,
        payment: { select: { status: true, updatedAt: true } },
      },
    }),
    listFinanceExpenses(2000).catch(() => []),
  ]);

  const confirmed = new Map<string, CurrencyLine>();
  const byMethod = new Map<string, { method: string; currency: string; count: number; total: number }>();
  const daily = new Map<string, number>();
  const topClients = new Map<string, number>();
  for (const p of payments) {
    const a = Number(p.amount);
    addLine(confirmed, p.currency, a);
    const mk = `${p.method}|${p.currency}`;
    const m = byMethod.get(mk) ?? { method: p.method, currency: p.currency, count: 0, total: 0 };
    m.count++;
    m.total = Math.round((m.total + a) * 100) / 100;
    byMethod.set(mk, m);
    const day = p.paidAt!.toISOString().slice(0, 10);
    daily.set(`${day}|${p.currency}`, (daily.get(`${day}|${p.currency}`) ?? 0) + a);
    const ck = `${p.client.firstName} ${p.client.lastName}|${p.currency}`;
    topClients.set(ck, (topClients.get(ck) ?? 0) + a);
  }
  const pendingMap = new Map<string, CurrencyLine>();
  for (const p of pending) addLine(pendingMap, p.currency, Number(p.amount));
  const refundsPaid = new Map<string, CurrencyLine>();
  for (const i of installments) addLine(refundsPaid, i.refund.currency, Number(i.amount));
  const refundsApprovedMap = new Map<string, CurrencyLine>();
  for (const r of refundsApproved) addLine(refundsApprovedMap, r.currency, Number(r.amount));

  const submitted = claims.filter(
    (c) => c.submittedAt && c.submittedAt >= start && c.submittedAt < end,
  ).length;
  const decided = claims.filter((c) => c.decidedAt && c.decidedAt >= start && c.decidedAt < end);
  const converted = decided.filter((c) => c.status === "CONVERTED");
  const rejected = decided.filter((c) => c.status === "REJECTED").length;
  const retained = new Map<string, number>();
  let partial = 0;
  for (const c of converted) {
    const d = c.decision as ClaimDecision | null;
    if (d && c.amount && d.approvedAmount < Number(c.amount) - 0.005) {
      partial++;
      const cur = c.currency ?? "USD";
      retained.set(
        cur,
        Math.round(((retained.get(cur) ?? 0) + Number(c.amount) - d.approvedAmount) * 100) / 100,
      );
    }
  }
  const withTimes = decided.filter((c) => c.submittedAt);
  const avgDecisionDays = withTimes.length
    ? withTimes.reduce((s, c) => s + (c.decidedAt!.getTime() - c.submittedAt!.getTime()) / 86_400_000, 0) /
      withTimes.length
    : null;

  const sentReq = payReqs.filter((r) => r.createdAt >= start && r.createdAt < end);
  const paidReq = payReqs.filter(
    (r) =>
      r.status === "PAID" &&
      r.payment?.updatedAt &&
      r.payment.updatedAt >= start &&
      r.payment.updatedAt < end,
  );
  const openReq = payReqs.filter((r) => ["SENT", "VIEWED", "PROOF_SUBMITTED"].includes(r.status));
  const overdueReq = openReq.filter((r) => r.dueAt && r.dueAt.getTime() < Date.now()).length;
  const confirmTimes = paidReq
    .map((r) => {
      const p = r.proof as { submittedAt?: string } | null;
      return p?.submittedAt && r.payment?.updatedAt
        ? (r.payment.updatedAt.getTime() - new Date(p.submittedAt).getTime()) / 86_400_000
        : null;
    })
    .filter((v): v is number => v !== null && v >= 0);
  const avgConfirmDays = confirmTimes.length
    ? confirmTimes.reduce((s, v) => s + v, 0) / confirmTimes.length
    : null;

  const expenses = new Map<string, CurrencyLine>();
  for (const e of expensesAll as Array<{
    amount: number;
    currency: string;
    status: string;
    paidAt?: string | null;
    createdAt?: string;
  }>) {
    const when = e.paidAt ? new Date(e.paidAt) : e.createdAt ? new Date(e.createdAt) : null;
    if (!when || when < start || when >= end) continue;
    if (!["PAID", "APPROVED", "PARTIALLY_PAID"].includes(String(e.status))) continue;
    addLine(expenses, e.currency, Number(e.amount) || 0);
  }

  const currencies = new Set([...confirmed.keys(), ...refundsPaid.keys(), ...expenses.keys()]);
  const net = Array.from(currencies).map((currency) => {
    const inflow = confirmed.get(currency)?.total ?? 0;
    const rf = refundsPaid.get(currency)?.total ?? 0;
    const ex = expenses.get(currency)?.total ?? 0;
    return { currency, inflow, refunds: rf, expenses: ex, net: Math.round((inflow - rf - ex) * 100) / 100 };
  });

  return {
    key,
    start,
    end,
    paymentsConfirmed: Array.from(confirmed.values()),
    paymentsByMethod: Array.from(byMethod.values()).sort((a, b) => b.total - a.total),
    paymentsPending: Array.from(pendingMap.values()),
    refundsPaid: Array.from(refundsPaid.values()),
    refundsApproved: Array.from(refundsApprovedMap.values()),
    claims: {
      submitted,
      converted: converted.length,
      rejected,
      partial,
      retained: Array.from(retained, ([currency, total]) => ({ currency, total })),
      avgDecisionDays,
    },
    paymentRequests: {
      sent: sentReq.length,
      paid: paidReq.length,
      open: openReq.length,
      overdue: overdueReq,
      avgConfirmDays,
    },
    expenses: Array.from(expenses.values()),
    net,
    daily: Array.from(daily, ([k, total]) => ({
      day: k.split("|")[0],
      currency: k.split("|")[1],
      total: Math.round(total * 100) / 100,
    })).sort((a, b) => a.day.localeCompare(b.day)),
    topClients: Array.from(topClients, ([k, total]) => ({
      client: k.split("|")[0],
      currency: k.split("|")[1],
      total: Math.round(total * 100) / 100,
    }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
  };
}

export function monthlyReportCsv(r: MonthlyReport) {
  const q = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const rows: string[][] = [["section", "label", "currency", "count", "total"]];
  for (const l of r.paymentsConfirmed)
    rows.push(["Encaissements confirmés", "", l.currency, String(l.count), l.total.toFixed(2)]);
  for (const l of r.paymentsByMethod)
    rows.push(["Encaissements par moyen", l.method, l.currency, String(l.count), l.total.toFixed(2)]);
  for (const l of r.paymentsPending)
    rows.push(["Paiements en attente", "", l.currency, String(l.count), l.total.toFixed(2)]);
  for (const l of r.refundsPaid)
    rows.push(["Remboursements versés", "", l.currency, String(l.count), l.total.toFixed(2)]);
  for (const l of r.refundsApproved)
    rows.push(["Remboursements approuvés", "", l.currency, String(l.count), l.total.toFixed(2)]);
  rows.push(["Demandes de remboursement", "soumises", "", String(r.claims.submitted), ""]);
  rows.push(["Demandes de remboursement", "acceptées", "", String(r.claims.converted), ""]);
  rows.push(["Demandes de remboursement", "refusées", "", String(r.claims.rejected), ""]);
  rows.push(["Demandes de remboursement", "partielles", "", String(r.claims.partial), ""]);
  for (const l of r.claims.retained)
    rows.push(["Retenues sur remboursements", "", l.currency, "", l.total.toFixed(2)]);
  rows.push(["Demandes de paiement", "envoyées", "", String(r.paymentRequests.sent), ""]);
  rows.push(["Demandes de paiement", "payées", "", String(r.paymentRequests.paid), ""]);
  rows.push(["Demandes de paiement", "ouvertes", "", String(r.paymentRequests.open), ""]);
  rows.push(["Demandes de paiement", "en retard", "", String(r.paymentRequests.overdue), ""]);
  for (const l of r.expenses) rows.push(["Dépenses", "", l.currency, String(l.count), l.total.toFixed(2)]);
  for (const l of r.net)
    rows.push([
      "Résultat net",
      `${l.inflow.toFixed(2)} - ${l.refunds.toFixed(2)} - ${l.expenses.toFixed(2)}`,
      l.currency,
      "",
      l.net.toFixed(2),
    ]);
  for (const l of r.daily) rows.push(["Encaissements par jour", l.day, l.currency, "", l.total.toFixed(2)]);
  for (const l of r.topClients) rows.push(["Top clients", l.client, l.currency, "", l.total.toFixed(2)]);
  return rows.map((row) => row.map(q).join(",")).join("\n");
}
