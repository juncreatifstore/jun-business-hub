import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/finance-expenses", () => ({ listFinanceExpenses: vi.fn(async () => []) }));
import { parseMonth, monthKey, monthlyReportCsv, type MonthlyReport } from "@/lib/finance-monthly";

describe("monthly report", () => {
  it("parses a month and defaults to the current one", () => {
    const m = parseMonth("2026-09");
    expect(m.key).toBe("2026-09");
    expect(m.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(m.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(parseMonth("garbage").key).toBe(monthKey(new Date()));
  });
  it("exports a CSV with quoted cells and net lines", () => {
    const r: MonthlyReport = {
      key: "2026-09",
      start: new Date(),
      end: new Date(),
      paymentsConfirmed: [{ currency: "USD", count: 2, total: 300 }],
      paymentsByMethod: [{ method: "CASH", currency: "USD", count: 2, total: 300 }],
      paymentsPending: [],
      refundsPaid: [{ currency: "USD", count: 1, total: 50 }],
      refundsApproved: [],
      claims: {
        submitted: 1,
        converted: 1,
        rejected: 0,
        partial: 1,
        retained: [{ currency: "USD", total: 20 }],
        avgDecisionDays: 2.5,
      },
      paymentRequests: { sent: 3, paid: 1, open: 2, overdue: 1, avgConfirmDays: 0.5 },
      expenses: [{ currency: "USD", count: 1, total: 100 }],
      net: [{ currency: "USD", inflow: 300, refunds: 50, expenses: 100, net: 150 }],
      daily: [{ day: "2026-09-02", currency: "USD", total: 300 }],
      topClients: [{ client: 'Doe "JD" John', currency: "USD", total: 300 }],
    };
    const csv = monthlyReportCsv(r);
    expect(csv.split("\n")[0]).toBe('"section","label","currency","count","total"');
    expect(csv).toContain('"Résultat net","300.00 - 50.00 - 100.00","USD","","150.00"');
    expect(csv).toContain('"Top clients","Doe ""JD"" John","USD","","300.00"');
  });
});
