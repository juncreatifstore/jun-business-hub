import { describe, it, expect } from "vitest";
import { splitInstallments } from "@/lib/money";

const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe("splitInstallments — refund schedules", () => {
  it("splits an even amount exactly", () => {
    const parts = splitInstallments(300, 2);
    expect(parts.map((p) => p.amount)).toEqual([150, 150]);
    expect(sum(parts)).toBe(300);
  });

  it("puts the cent remainder on the last installment", () => {
    const parts = splitInstallments(100, 3);
    expect(parts.map((p) => p.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(sum(parts)).toBe(100);
  });

  it("always sums back to the original amount (property check)", () => {
    for (const amount of [0.01, 1, 19.99, 250.5, 1234.56, 9999.97]) {
      for (const count of [1, 2, 3, 5, 7, 12]) {
        expect(sum(splitInstallments(amount, count))).toBe(amount);
      }
    }
  });

  it("single installment = full amount", () => {
    const parts = splitInstallments(842.13, 1);
    expect(parts).toHaveLength(1);
    expect(parts[0].amount).toBe(842.13);
  });

  it("schedules monthly, starting next month", () => {
    const from = new Date(2026, 0, 15); // Jan 15
    const parts = splitInstallments(300, 3, from);
    expect(parts[0].dueDate.getMonth()).toBe(1); // Feb
    expect(parts[1].dueDate.getMonth()).toBe(2); // Mar
    expect(parts[2].dueDate.getMonth()).toBe(3); // Apr
  });

  it("rejects invalid input", () => {
    expect(splitInstallments(0, 3)).toEqual([]);
    expect(splitInstallments(-50, 3)).toEqual([]);
    expect(splitInstallments(100, 0)).toEqual([]);
  });
});
