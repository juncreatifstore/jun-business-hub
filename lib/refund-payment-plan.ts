export type PlanRow = { amount: string; dueDate: string };

export function moneyCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Saisissez un montant positif avec au maximum deux décimales.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999999999999)
    throw new Error("Montant invalide.");
  return cents;
}

export function validateRefundPlan(rows: PlanRow[], remainingCents: number) {
  if (!rows.length || rows.length > 24) throw new Error("Prévoyez entre 1 et 24 tranches.");
  const parsed = rows.map((row) => {
    const cents = moneyCents(row.amount);
    const dueDate = new Date(`${row.dueDate}T12:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) ||
      Number.isNaN(dueDate.getTime()) ||
      dueDate.toISOString().slice(0, 10) !== row.dueDate
    )
      throw new Error("Date d’échéance invalide.");
    return { amount: cents / 100, cents, dueDate };
  });
  if (parsed.reduce((sum, row) => sum + row.cents, 0) !== remainingCents)
    throw new Error("Le total des tranches doit correspondre exactement au solde restant.");
  return parsed;
}

export function refundPlanSnapshot(rows: { id: string; amount: unknown; status: string; dueDate: Date }[]) {
  return JSON.stringify(
    rows
      .map((row) => [
        row.id,
        String(row.amount),
        row.status === "LATE" ? "SCHEDULED" : row.status,
        row.dueDate.toISOString(),
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
