import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/finance-accounting", () => ({ listJournalEntries: vi.fn() }));
vi.mock("@/lib/company-funds-work-queue-cache", () => ({ invalidateCompanyFundsWorkQueue: vi.fn() }));
import { parseBankCsv, parseBankOfx } from "@/lib/finance-bank-reconciliation";

describe("bank statement parsing", () => {
  it("normalizes signed CSV amounts, quoted descriptions and currency", () => {
    expect(parseBankCsv('Date,Description,Amount,Reference\n2026-09-01,"Supplier, invoice",-125.50,REF1', "usd")[0]).toMatchObject({ amount: -125.5, currency: "USD", description: "Supplier, invoice", bankReference: "REF1" });
  });
  it("converts debit and credit columns into signed movements", () => {
    const rows = parseBankCsv("Date,Description,Debit,Credit\n2026-09-01,Expense,20,0\n2026-09-02,Payment,0,50", "USD");
    expect(rows.map(row => row.amount)).toEqual([-20, 50]);
  });
  it("rejects missing CSV columns", () => {
    expect(() => parseBankCsv("Date,Description\n2026-09-01,Expense", "USD")).toThrow("columns");
  });
  it("parses OFX currency, reference and signed amount", () => {
    const ofx = "<CURDEF>MXN\n<BANKTRANLIST><STMTTRN><DTPOSTED>20260901120000\n<TRNAMT>-200.25\n<FITID>REF1\n<NAME>Supplier\n</STMTTRN></BANKTRANLIST>";
    expect(parseBankOfx(ofx, "USD")[0]).toMatchObject({ currency: "MXN", amount: -200.25, bankReference: "REF1", date: "2026-09-01T12:00:00.000Z" });
  });
});
