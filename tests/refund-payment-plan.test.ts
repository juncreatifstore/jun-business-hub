import { describe, expect, it } from "vitest";
import { moneyCents, refundPlanSnapshot, validateRefundPlan } from "@/lib/refund-payment-plan";

describe("refund plan monetary invariants", () => {
  it("splits 4500 into a partial 1500 payment and a 3000 balance", () => {
    const plan = validateRefundPlan(
      [
        { amount: "1500", dueDate: "2026-09-10" },
        { amount: "3000", dueDate: "2026-10-10" },
      ],
      450000,
    );
    expect(plan.map((row) => row.cents)).toEqual([150000, 300000]);
  });
  it("reschedules only the 3000 remaining after 1500 was paid", () => {
    expect(
      validateRefundPlan(
        [
          { amount: "1500", dueDate: "2026-10-10" },
          { amount: "1500", dueDate: "2026-11-10" },
        ],
        300000,
      ),
    ).toHaveLength(2);
  });
  it("preserves cents with unequal installments", () => {
    expect(
      validateRefundPlan(
        [
          { amount: "33.33", dueDate: "2026-09-10" },
          { amount: "33.33", dueDate: "2026-10-10" },
          { amount: "33.34", dueDate: "2026-11-10" },
        ],
        10000,
      ).reduce((sum, row) => sum + row.cents, 0),
    ).toBe(10000);
  });
  it.each(["0", "-1", "NaN", "Infinity", "1e3", "1.001", "", "  "])("rejects invalid amount %s", (amount) => {
    expect(() => moneyCents(amount)).toThrow();
  });
  it("rejects overpayment and unallocated balances", () => {
    expect(() => validateRefundPlan([{ amount: "4500.01", dueDate: "2026-09-10" }], 450000)).toThrow(
      "exactement",
    );
    expect(() => validateRefundPlan([{ amount: "4499.99", dueDate: "2026-09-10" }], 450000)).toThrow(
      "exactement",
    );
  });
  it("rejects invalid calendar dates and too many rows", () => {
    expect(() => validateRefundPlan([{ amount: "1", dueDate: "2026-02-30" }], 100)).toThrow("Date");
    expect(() =>
      validateRefundPlan(
        Array.from({ length: 25 }, () => ({ amount: "1", dueDate: "2026-09-10" })),
        2500,
      ),
    ).toThrow("24");
  });
  it("detects payments and edits but tolerates overdue housekeeping", () => {
    const row = { id: "a", amount: "4500", status: "SCHEDULED", dueDate: new Date("2026-09-10T12:00:00Z") };
    expect(refundPlanSnapshot([row])).toBe(refundPlanSnapshot([{ ...row, status: "LATE" }]));
    expect(refundPlanSnapshot([row])).not.toBe(refundPlanSnapshot([{ ...row, status: "PAID" }]));
    expect(refundPlanSnapshot([row])).not.toBe(refundPlanSnapshot([{ ...row, amount: "1500" }]));
  });
});
