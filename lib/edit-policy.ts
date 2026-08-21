export type EditMode = "DIRECT" | "CORRECTION" | "LOCKED";

export function paymentEditMode(status: string): EditMode {
  return status === "PENDING" ? "DIRECT" : ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(status) ? "CORRECTION" : "LOCKED";
}

export function refundEditMode(status: string, paidInstallments: number): EditMode {
  if (paidInstallments > 0 || ["PAID", "PARTIALLY_PAID", "REJECTED", "CANCELLED"].includes(status)) return "LOCKED";
  return ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(status) ? "DIRECT" : "LOCKED";
}

export function expenseEditMode(status: string, paymentCount: number): EditMode {
  if (paymentCount > 0 || ["PARTIALLY_PAID", "PAID", "REJECTED", "CANCELLED"].includes(status)) return "LOCKED";
  return ["DRAFT", "SUBMITTED", "APPROVED"].includes(status) ? "DIRECT" : "LOCKED";
}

export function invoiceEditMode(status: string, confirmedPaid: number): EditMode {
  if (confirmedPaid > 0 || ["PAID", "PARTIALLY_PAID", "CANCELLED"].includes(status)) return "LOCKED";
  return ["DRAFT", "SENT", "OVERDUE"].includes(status) ? "DIRECT" : "LOCKED";
}

export function editPolicyMessage(mode: EditMode) {
  if (mode === "DIRECT") return "This record can be corrected. Every change is written to the audit trail.";
  if (mode === "CORRECTION") return "Financial values are locked after confirmation. You may correct descriptive/reference fields with a mandatory reason.";
  return "This record is financially locked. Use a reversal, void, replacement, or new corrective record instead of overwriting history.";
}
