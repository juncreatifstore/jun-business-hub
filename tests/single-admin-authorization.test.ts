import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  appSetting: { findUnique: vi.fn(), update: vi.fn() },
  user: { findMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) },
}));
vi.mock("@/lib/company-funds-reserves", () => ({ getFinancialReserveDashboard: vi.fn() }));
vi.mock("@/lib/company-funds-transfers", () => ({ getTreasuryTransfer: vi.fn() }));
vi.mock("@/lib/company-funds-work-queue-cache", () => ({ invalidateCompanyFundsWorkQueue: vi.fn() }));
import { decideFinancialAuthorization } from "@/lib/company-funds-approvals";
let enabled: boolean, required: number;
beforeEach(() => {
  vi.clearAllMocks();
  enabled = true;
  required = 1;
  db.user.findMany.mockResolvedValue([{ id: "owner" }]);
  db.appSetting.findUnique.mockImplementation(async ({ where }) => ({
    value: JSON.stringify(
      where.key.endsWith(".policy")
        ? { singleAdminMode: enabled }
        : {
            id: "a",
            resourceId: "installment:a",
            requestedById: "owner",
            requiredApprovals: required,
            status: "PENDING",
            decisions: [],
            amount: 1500,
            currency: "USD",
          },
    ),
  }));
});
describe("single administrator exception", () => {
  it("allows confirmed single approval with a reason and atomic audit", async () => {
    const a = await decideFinancialAuthorization(
      "a",
      "owner",
      "APPROVE",
      "Versement vérifié avec justificatif",
      true,
    );
    expect(a.status).toBe("APPROVED");
    expect(a.decisions[0].singleAdminException).toBe(true);
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "FINANCIAL_AUTH_SINGLE_ADMIN_EXCEPTION", userId: "owner" }),
      }),
    );
  });
  it("blocks self approval when mode is disabled", async () => {
    enabled = false;
    await expect(
      decideFinancialAuthorization("a", "owner", "APPROVE", "Motif de validation", true),
    ).rejects.toThrow("Requester");
    expect(db.appSetting.update).not.toHaveBeenCalled();
  });
  it("blocks as soon as a second active super admin exists", async () => {
    db.user.findMany.mockResolvedValue([{ id: "owner" }, { id: "second" }]);
    await expect(
      decideFinancialAuthorization("a", "owner", "APPROVE", "Motif de validation", true),
    ).rejects.toThrow("Requester");
  });
  it("blocks an inactive or different sole administrator", async () => {
    db.user.findMany.mockResolvedValue([{ id: "other" }]);
    await expect(
      decideFinancialAuthorization("a", "owner", "APPROVE", "Motif de validation", true),
    ).rejects.toThrow("Requester");
  });
  it("never replaces two approvals with one", async () => {
    required = 2;
    await expect(
      decideFinancialAuthorization("a", "owner", "APPROVE", "Motif de validation", true),
    ).rejects.toThrow("Requester");
  });
  it("requires explicit confirmation", async () => {
    await expect(
      decideFinancialAuthorization("a", "owner", "APPROVE", "Motif de validation"),
    ).rejects.toThrow("confirmation");
  });
  it("requires a meaningful reason", async () => {
    await expect(decideFinancialAuthorization("a", "owner", "APPROVE", "ok", true)).rejects.toThrow("reason");
  });
  it("does not enable self rejection", async () => {
    await expect(
      decideFinancialAuthorization("a", "owner", "REJECT", "Motif de validation", true),
    ).rejects.toThrow("Requester");
  });
  it("preserves ordinary independent approvals", async () => {
    const a = await decideFinancialAuthorization("a", "other", "APPROVE", "Vérifié");
    expect(a.status).toBe("APPROVED");
    expect(a.decisions[0].singleAdminException).toBeUndefined();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
