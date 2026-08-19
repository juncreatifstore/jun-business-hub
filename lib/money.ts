// Pure money helpers — no DB, unit-tested in tests/installments.test.ts.

/**
 * Split a refund amount into `count` monthly installments.
 * Cent-accurate: each installment is floored to the cent, the remainder
 * lands on the last one, and the sum always equals the original amount.
 */
export function splitInstallments(
  amount: number,
  count: number,
  from: Date = new Date()
): { number: number; dueDate: Date; amount: number }[] {
  if (count < 1 || !Number.isFinite(amount) || amount <= 0) return [];
  const per = Math.floor((amount / count) * 100) / 100;

  return Array.from({ length: count }, (_, i) => {
    const due = new Date(from);
    due.setMonth(due.getMonth() + i + 1);
    const value = i === count - 1
      ? Math.round((amount - per * (count - 1)) * 100) / 100
      : per;

    return {
      number: i + 1,
      dueDate: due,
      amount: value,
    };
  });
}
