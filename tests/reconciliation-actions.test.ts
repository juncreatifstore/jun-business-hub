import { beforeEach, describe, expect, it, vi } from "vitest";
import { File } from "node:buffer";

vi.mock("next/navigation", () => ({ redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ assertPermission: vi.fn(async () => ({ id: "reviewer" })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/finance-bank-reconciliation", () => ({
  getBankTransaction: vi.fn(async () => ({ id: "tx", importId: "statement", suggestedEntryId: "entry" })),
  confirmReconciliation: vi.fn(async () => ({ id: "match", amountDifference: 0, dayDifference: 0, method: "AUTO_SUGGESTED" })),
  ignoreBankTransaction: vi.fn(async () => undefined),
  closeBankReconciliationPeriod: vi.fn(async () => ({ period: "2026-09" })),
  importBankStatement: vi.fn(), suggestMatchesForImport: vi.fn(),
}));
import { assertPermission } from "@/lib/auth";
import { confirmReconciliation, ignoreBankTransaction, closeBankReconciliationPeriod, importBankStatement } from "@/lib/finance-bank-reconciliation";
import { confirmBankMatchAction, ignoreBankTransactionAction, closeBankReconciliationPeriodAction, importBankStatementAction } from "@/services/finance-bank-reconciliation";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
beforeEach(() => { vi.clearAllMocks(); });
describe("reconciliation actions", () => {
  it("preserves the successful import redirect", async () => {
    vi.stubGlobal("File", File);
    vi.mocked(importBankStatement).mockResolvedValueOnce({ id: "statement", transactionCount: 1, duplicateCount: 0 } as Awaited<ReturnType<typeof importBankStatement>>);
    const data = form({ bankName: "Bank", accountLabel: "Operating", currency: "USD" });
    data.set("statement", new File(["Date,Description,Amount\n2026-09-01,Payment,50"], "statement.csv") as unknown as Blob);
    try {
      await expect(importBankStatementAction(data)).rejects.toThrow("REDIRECT:/app/finance/reconciliation/statement?success=");
      expect(assertPermission).toHaveBeenCalledWith("BANK_RECON_IMPORT");
    } finally { vi.unstubAllGlobals(); }
  });
  it("keeps successful confirmation redirects out of the error path", async () => {
    await expect(confirmBankMatchAction(form({ transactionId: "tx", journalEntryId: "entry" }))).rejects.toThrow("REDIRECT:/app/finance/reconciliation/statement?success=");
    expect(confirmReconciliation).toHaveBeenCalledWith("tx", "entry", "reviewer", "", "AUTO_SUGGESTED");
    expect(assertPermission).toHaveBeenCalledWith("BANK_RECON_APPROVE");
  });
  it("keeps successful ignore redirects out of the error path", async () => {
    await expect(ignoreBankTransactionAction(form({ transactionId: "tx" }))).rejects.toThrow("REDIRECT:/app/finance/reconciliation/statement?success=");
    expect(ignoreBankTransaction).toHaveBeenCalledWith("tx");
  });
  it("keeps successful close redirects out of the error path", async () => {
    await expect(closeBankReconciliationPeriodAction(form({ period: "2026-09", currency: "usd", accountLabel: "Operating", confirmation: "CLOSE" }))).rejects.toThrow("REDIRECT:/app/finance/reconciliation/close?success=");
    expect(assertPermission).toHaveBeenCalledWith("BANK_RECON_CLOSE");
  });
  it("does not close without explicit confirmation", async () => {
    await expect(closeBankReconciliationPeriodAction(form({ confirmation: "no" }))).rejects.toThrow("?error=");
    expect(closeBankReconciliationPeriod).not.toHaveBeenCalled();
  });
  it("reports a matching failure without a success redirect", async () => {
    vi.mocked(confirmReconciliation).mockRejectedValueOnce(new Error("Currency mismatch"));
    await expect(confirmBankMatchAction(form({ transactionId: "tx", journalEntryId: "entry" }))).rejects.toThrow("?error=Currency%20mismatch");
  });
  it("does not mutate when permission is denied", async () => {
    vi.mocked(assertPermission).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(confirmBankMatchAction(form({ transactionId: "tx", journalEntryId: "entry" }))).rejects.toThrow("Forbidden");
    expect(confirmReconciliation).not.toHaveBeenCalled();
  });
});
