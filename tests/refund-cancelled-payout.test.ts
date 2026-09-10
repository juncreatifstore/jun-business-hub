import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({
  prisma: { refundInstallment: { findUnique: vi.fn(async () => ({ id: "old", status: "CANCELLED" })) } },
}));
vi.mock("@/lib/finance-refund-installments", () => ({ getRefundInstallmentMeta: vi.fn() }));
vi.mock("@/lib/company-funds-approvals", () => ({ findAuthorizationForResource: vi.fn() }));
vi.mock("@/lib/company-funds-execution-evidence", () => ({ createFinancialExecutionEvidence: vi.fn() }));
vi.mock("@/lib/company-funds-monthly-close", () => ({ assertFinancialPeriodOpen: vi.fn() }));
import { executeRefundInstallmentPayout } from "@/lib/refund-installment-payout-safe";
import { createFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
describe("obsolete refund tranche protection", () => {
  it("rejects a stale payout button before creating execution evidence", async () => {
    await expect(executeRefundInstallmentPayout("old", "finance")).rejects.toThrow("annulée ou remplacée");
    expect(createFinancialExecutionEvidence).not.toHaveBeenCalled();
  });
});
