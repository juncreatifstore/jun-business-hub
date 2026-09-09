export type FinancialIntegrityIssue = {
  code: "REFUND_BALANCE_MISMATCH";
  message: string;
  totalDeposited: number;
  refundsReceived: number;
  expectedRemaining: number;
  statedRemaining: number;
};

function normalizeLine(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmountToken(raw: string): number | null {
  let value = raw.replace(/\s/g, "").replace(/[^0-9,.-]/g, "");
  if (!value) return null;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  if (hasComma && hasDot) {
    if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = value.split(",");
    const last = parts[parts.length - 1] ?? "";
    value = last.length === 3 && parts.length > 1 ? parts.join("") : value.replace(",", ".");
  }

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function dollarAmounts(line: string): number[] {
  const matches = line.match(/(?:USD\s*)?\$?\s*\d[\d\s,.]*(?:\s*(?:USD|\$))/gi) ?? [];
  return matches
    .map((token) => parseAmountToken(token))
    .filter((amount): amount is number => amount !== null);
}

function lineHasUsd(line: string): boolean {
  return /\$|\bUSD\b/i.test(line);
}

function chooseConsolidatedDepositLine(lines: string[]): string | undefined {
  const candidates = lines.filter((line) => {
    const n = normalizeLine(line).toLowerCase();
    return (
      /montant total (?:depose|verse)/.test(n) ||
      /total (?:amount )?(?:deposited|paid)/.test(n)
    ) && lineHasUsd(line);
  });

  if (!candidates.length) return undefined;
  return candidates.find((line) => !/gourdes?|\bhtg\b|taux|exchange rate/i.test(normalizeLine(line))) ?? candidates[candidates.length - 1];
}

function firstMatchingLine(lines: string[], patterns: RegExp[]): string | undefined {
  return lines.find((line) => {
    const n = normalizeLine(line).toLowerCase();
    return patterns.some((pattern) => pattern.test(n));
  });
}

/**
 * Deterministic guard for the common refund-agreement equation:
 * total deposited - refunds already received = remaining amount due.
 *
 * It intentionally reports nothing unless all three values can be identified
 * with high confidence. This prevents false positives on unrelated documents.
 */
export function checkRefundAgreementArithmetic(text: string): FinancialIntegrityIssue[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const depositLine = chooseConsolidatedDepositLine(lines);
  const refundLine = firstMatchingLine(lines, [
    /remboursements? (?:recus|deja recus|effectues|deja effectues)/,
    /refunds? (?:received|already received|already paid)/,
  ]);
  const remainingLine = firstMatchingLine(lines, [
    /(?:total |montant )?restant (?:du|a rembourser)/,
    /reste (?:du|a rembourser)/,
    /remaining (?:amount|balance|refund|due)/,
    /amount still due/,
  ]);

  if (!depositLine || !refundLine || !remainingLine) return [];

  const depositAmounts = dollarAmounts(depositLine);
  const refundAmounts = dollarAmounts(refundLine);
  const remainingAmounts = dollarAmounts(remainingLine);
  if (depositAmounts.length !== 1 || refundAmounts.length < 1 || remainingAmounts.length !== 1) return [];

  const totalDeposited = depositAmounts[0];
  const refundsReceived = refundAmounts.reduce((sum, amount) => sum + amount, 0);
  const expectedRemaining = Math.max(0, Math.round((totalDeposited - refundsReceived) * 100) / 100);
  const statedRemaining = remainingAmounts[0];

  if (Math.abs(expectedRemaining - statedRemaining) <= 0.01) return [];

  const money = (amount: number) => amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return [{
    code: "REFUND_BALANCE_MISMATCH",
    totalDeposited,
    refundsReceived,
    expectedRemaining,
    statedRemaining,
    message: `Financial verification failed: total deposited USD ${money(totalDeposited)} - refunds received USD ${money(refundsReceived)} = USD ${money(expectedRemaining)}, not USD ${money(statedRemaining)}.`,
  }];
}
