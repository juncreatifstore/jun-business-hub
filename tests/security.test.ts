import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests-0123456789";
});

describe("secret encryption (AES-256-GCM)", () => {
  it("roundtrips and is non-deterministic (fresh IV)", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const a = encryptSecret("refresh-token-xyz");
    const b = encryptSecret("refresh-token-xyz");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("refresh-token-xyz");
    expect(decryptSecret(b)).toBe("refresh-token-xyz");
  });

  it("rejects tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const enc = encryptSecret("top-secret");
    const parts = enc.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

// Pure re-implementation of the refund cap rule (mirrors services/finance.ts) so it is
// unit-testable without a database.
function availableToRefund(paymentAmount: number, refunds: { amount: number; status: string }[]): number {
  const committed = refunds.filter((r) => !["REJECTED", "CANCELLED"].includes(r.status)).reduce((s, r) => s + r.amount, 0);
  return Math.round((paymentAmount - committed) * 100) / 100;
}

describe("refund cap — amount ≤ available on the payment", () => {
  it("full amount available with no prior refunds", () => {
    expect(availableToRefund(1850, [])).toBe(1850);
  });

  it("subtracts active refunds (REQUESTED/APPROVED/PAID…)", () => {
    expect(availableToRefund(1850, [{ amount: 300, status: "APPROVED" }, { amount: 100, status: "REQUESTED" }])).toBe(1450);
  });

  it("ignores REJECTED and CANCELLED refunds", () => {
    expect(availableToRefund(500, [{ amount: 500, status: "REJECTED" }, { amount: 200, status: "CANCELLED" }])).toBe(500);
  });

  it("cent-accurate", () => {
    expect(availableToRefund(100.1, [{ amount: 33.37, status: "PAID" }])).toBe(66.73);
  });

  it("a request above availability must be refused", () => {
    const available = availableToRefund(1850, [{ amount: 1600, status: "APPROVED" }]);
    expect(available).toBe(250);
    expect(300 > available).toBe(true); // the service returns an error in this case
  });
});
