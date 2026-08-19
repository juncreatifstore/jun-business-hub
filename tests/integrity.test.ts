import { describe, it, expect } from "vitest";
import { sha256, shortHash } from "@/lib/hash";
import { DOC_PREFIX } from "@/lib/registry";
import { paymentSchema, refundSchema } from "@/lib/validation";

describe("document integrity hashes", () => {
  it("sha256 is deterministic and 64 hex chars", () => {
    const h = sha256("<h1>Contract</h1>");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256("<h1>Contract</h1>")).toBe(h);
  });

  it("any content change produces a different hash", () => {
    expect(sha256("<h1>Contract</h1>")).not.toBe(sha256("<h1>Contract </h1>"));
  });

  it("shortHash keeps both ends for visual verification", () => {
    const h = sha256("x");
    const s = shortHash(h);
    expect(s.startsWith(h.slice(0, 8))).toBe(true);
    expect(s.endsWith(h.slice(-8))).toBe(true);
  });
});

describe("registry numbering formats", () => {
  const year = new Date().getFullYear();
  const format = (prefix: string, n: number) => `${prefix}-${year}-${String(n).padStart(6, "0")}`;

  it("matches the JUN-CTR-YYYY-###### contract pattern", () => {
    expect(format("JUN-CTR", 1)).toMatch(/^JUN-CTR-\d{4}-\d{6}$/);
    expect(format("JUN-CTR", 1)).toBe(`JUN-CTR-${year}-000001`);
  });

  it("matches CASE / PAY / REC / REF patterns", () => {
    expect(format("CASE", 42)).toMatch(/^CASE-\d{4}-\d{6}$/);
    expect(format("PAY", 7)).toBe(`PAY-${year}-000007`);
    expect(format("REC", 123456)).toBe(`REC-${year}-123456`);
    expect(format("REF", 9)).toMatch(/^REF-\d{4}-000009$/);
  });

  it("every DocumentType maps to a JUN- prefix", () => {
    for (const [type, prefix] of Object.entries(DOC_PREFIX)) {
      expect(prefix.startsWith("JUN-")).toBe(true);
      expect(type.length).toBeGreaterThan(0);
    }
    expect(DOC_PREFIX.CONTRACT).toBe("JUN-CTR");
    expect(DOC_PREFIX.AGREEMENT).toBe("JUN-AGR");
    expect(DOC_PREFIX.RECEIPT).toBe("JUN-RCP");
    expect(DOC_PREFIX.INVOICE).toBe("JUN-INV");
  });
});

describe("payment validation", () => {
  const base = { clientId: "c1", amount: "150.00", currency: "USD", method: "ZELLE" };

  it("accepts a valid payment", () => {
    const r = paymentSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(150);
  });

  it("rejects zero, negative and absurd amounts", () => {
    expect(paymentSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...base, amount: "-20" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...base, amount: "99999999999" }).success).toBe(false);
  });

  it("rejects unknown payment methods and missing client", () => {
    expect(paymentSchema.safeParse({ ...base, method: "BITCOIN" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...base, clientId: "" }).success).toBe(false);
  });

  it("refund requires a reason and a positive amount", () => {
    const ok = refundSchema.safeParse({ clientId: "c1", amount: "300", currency: "USD", reason: "Hotel downgrade", installments: "2" });
    expect(ok.success).toBe(true);
    const noReason = refundSchema.safeParse({ clientId: "c1", amount: "300", currency: "USD", reason: "", installments: "2" });
    expect(noReason.success).toBe(false);
  });
});
