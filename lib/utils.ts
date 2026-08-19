import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number | string, currency = "USD") {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export const VAULT_CATEGORIES = ["Company Legal", "Banking", "Tax", "Licenses", "Insurance", "Corporate Contracts", "Sensitive"] as const;
export const FILE_CATEGORIES = ["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"] as const;
