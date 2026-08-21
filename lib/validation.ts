import { z } from "zod";

export const clientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  whatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  nationality: z.string().trim().max(80).optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
  status: z.enum(["LEAD", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  tags: z.string().max(300).optional().or(z.literal("")),
});

export const caseSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  type: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL", "COMPLETED", "CANCELLED", "ARCHIVED"]).default("OPEN"),
  dueDate: z.string().optional().or(z.literal("")),
  tags: z.string().max(300).optional().or(z.literal("")),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  caseId: z.string().optional().or(z.literal("")),
  clientId: z.string().optional().or(z.literal("")),
  assigneeId: z.string().optional().or(z.literal("")),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "WAITING", "DONE", "CANCELLED"]).default("TODO"),
  dueDate: z.string().optional().or(z.literal("")),
});

export const paymentSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  caseId: z.string().optional().or(z.literal("")),
  accountId: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be positive").max(10_000_000),
  expectedAmount: z.union([z.coerce.number().positive().max(10_000_000), z.literal("")]).optional(),
  currency: z.string().trim().min(3).max(3).default("USD"),
  method: z.enum(["ZELLE", "STRIPE", "PAYPAL", "MERCADO_PAGO", "BANK_TRANSFER", "CASH", "MONCASH", "OTHER"]),
  providerRef: z.string().trim().max(160).optional().or(z.literal("")),
  serviceLabel: z.string().trim().max(160).optional().or(z.literal("")),
  paidAt: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const refundSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  caseId: z.string().optional().or(z.literal("")),
  paymentId: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().positive().max(10_000_000),
  currency: z.string().trim().length(3).default("USD"),
  reason: z.string().trim().min(1, "Reason is required").max(2000),
  installments: z.coerce.number().int().min(1).max(24).default(1),
});

export const documentSchema = z.object({
  type: z.enum(["CONTRACT", "AGREEMENT", "REFUND_AGREEMENT", "RECEIPT", "INVOICE", "LETTER", "ATTESTATION", "AUTHORIZATION", "REPORT", "CUSTOM"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  clientId: z.string().optional().or(z.literal("")),
  caseId: z.string().optional().or(z.literal("")),
  content: z.string().max(500_000).default(""),
  language: z.enum(["FR", "EN", "ES", "HT"]).default("FR"),
  templateId: z.string().max(120).optional().or(z.literal("")),
});

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email("A valid email is required").max(160),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  department: z.string().trim().min(1).max(60),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Password is required").max(200),
});
export function emptyToNull(v: string | undefined) { return v && v.length > 0 ? v : null; }
export function parseTags(v: string | undefined) { return (v ?? "").split(",").map((t) => t.trim()).filter(Boolean); }
export function parseDate(v: string | undefined) { return v && v.length > 0 ? new Date(v) : null; }
