import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Document types the extractor can recognise. Order = display order. */
export const DOC_TYPES = [
  "PASSPORT",
  "NATIONAL_ID",
  "VISA",
  "RESIDENCE_PERMIT",
  "DRIVER_LICENSE",
  "BIRTH_CERTIFICATE",
  "MARRIAGE_CERTIFICATE",
  "POLICE_RECORD",
  "DIPLOMA",
  "EMPLOYMENT_LETTER",
  "PAY_SLIP",
  "BANK_STATEMENT",
  "TAX_DOCUMENT",
  "FLIGHT_TICKET",
  "HOTEL_BOOKING",
  "TRAVEL_INSURANCE",
  "INVITATION_LETTER",
  "INVOICE",
  "RECEIPT",
  "PAYMENT_PROOF",
  "CONTRACT",
  "POWER_OF_ATTORNEY",
  "FORM",
  "LETTER",
  "PHOTO",
  "OTHER",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  PASSPORT: "Passport",
  NATIONAL_ID: "National ID",
  VISA: "Visa",
  RESIDENCE_PERMIT: "Residence permit",
  DRIVER_LICENSE: "Driver license",
  BIRTH_CERTIFICATE: "Birth certificate",
  MARRIAGE_CERTIFICATE: "Marriage certificate",
  POLICE_RECORD: "Police record",
  DIPLOMA: "Diploma",
  EMPLOYMENT_LETTER: "Employment letter",
  PAY_SLIP: "Pay slip",
  BANK_STATEMENT: "Bank statement",
  TAX_DOCUMENT: "Tax document",
  FLIGHT_TICKET: "Flight ticket",
  HOTEL_BOOKING: "Hotel booking",
  TRAVEL_INSURANCE: "Travel insurance",
  INVITATION_LETTER: "Invitation letter",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
  PAYMENT_PROOF: "Payment proof",
  CONTRACT: "Contract",
  POWER_OF_ATTORNEY: "Power of attorney",
  FORM: "Form",
  LETTER: "Letter",
  PHOTO: "Photo",
  OTHER: "Other",
};

/** Types whose expiry matters operationally (identity, travel, insurance). */
export const EXPIRING_DOC_TYPES: ReadonlySet<DocType> = new Set([
  "PASSPORT",
  "NATIONAL_ID",
  "VISA",
  "RESIDENCE_PERMIT",
  "DRIVER_LICENSE",
  "TRAVEL_INSURANCE",
  "POLICE_RECORD",
]);

export function docTypeOf(value: unknown): DocType {
  const v = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z_]/g, "_");
  return (DOC_TYPES as readonly string[]).includes(v) ? (v as DocType) : "OTHER";
}

/** Parses AI-supplied dates ("2027-03-14", "14/03/2027", "March 14, 2027"); null when unsure. */
export function parseLooseDate(value: unknown): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s || /^(unknown|n\/a|none|null)$/i.test(s)) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  return y > 1900 && y < 2200 ? d : null;
}

function str(value: unknown, max = 200) {
  const s = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  return s && !/^(unknown|n\/a|none|null)$/i.test(s) ? s.slice(0, max) : null;
}
function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type ExtractionInput = {
  documentType?: unknown;
  documentTypeConfidence?: unknown;
  extractedFields?: Record<string, unknown> | null;
};

/** Normalises the AI JSON into a FileExtraction row and stores it. */
export async function saveFileExtraction(fileId: string, ai: ExtractionInput, model: string | null) {
  const f = ai.extractedFields ?? {};
  const data = {
    docType: docTypeOf(ai.documentType),
    confidence: Math.max(0, Math.min(1, num(ai.documentTypeConfidence) ?? 0)),
    holderName: str(f.holderName),
    documentNumber: str(f.documentNumber, 80),
    issuingCountry: str(f.issuingCountry, 80),
    issuer: str(f.issuer),
    dateOfBirth: parseLooseDate(f.dateOfBirth),
    issuedAt: parseLooseDate(f.issueDate),
    expiresAt: parseLooseDate(f.expiryDate),
    amount: (() => {
      const n = num(f.amount);
      return n === null ? null : new Prisma.Decimal(n.toFixed(2));
    })(),
    currency: str(f.currency, 8)?.toUpperCase() ?? null,
    reference: str(f.reference ?? f.invoiceNumber ?? f.bookingReference, 120),
    fields: JSON.parse(JSON.stringify(f)) as Prisma.InputJsonValue,
    model,
    extractedAt: new Date(),
    error: null,
  };
  return prisma.fileExtraction.upsert({ where: { fileId }, create: { fileId, ...data }, update: data });
}

export async function markExtractionError(fileId: string, error: string) {
  return prisma.fileExtraction.upsert({
    where: { fileId },
    create: { fileId, error: error.slice(0, 500) },
    update: { error: error.slice(0, 500), extractedAt: new Date() },
  });
}

/** Files whose identity/travel documents expire within `days` (or already expired). */
export async function listExpiringFiles(days = 90, take = 20) {
  const until = new Date(Date.now() + days * 86_400_000);
  return prisma.fileExtraction.findMany({
    where: {
      expiresAt: { lte: until },
      docType: { in: Array.from(EXPIRING_DOC_TYPES) },
      file: { archivedAt: null, isVault: false },
    },
    orderBy: { expiresAt: "asc" },
    take,
    select: {
      fileId: true,
      docType: true,
      holderName: true,
      expiresAt: true,
      file: { select: { name: true, client: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
}

export function expiryStatus(expiresAt: Date | string | null): "expired" | "critical" | "soon" | "ok" | null {
  if (!expiresAt) return null;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "soon";
  return "ok";
}
