import "server-only";
import { prisma } from "@/lib/prisma";
import { BUILTIN_TEMPLATE_VARIABLES } from "@/lib/document-template-constants";

export type TemplateVariableDefinition = {
  key: string;
  label?: string;
  required?: boolean;
  automatic?: boolean;
  defaultValue?: string;
};

export type DocumentTemplateRow = {
  id: string;
  name: string;
  type: string;
  content: string;
  category: string;
  language: string;
  description: string | null;
  variables: unknown;
  isActive: boolean;
  isReference: boolean;
  sourceRef: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseTemplateVariables(value: unknown): TemplateVariableDefinition[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v)))
    .map((v) => ({
      key: String(v.key ?? "").trim(),
      label: v.label ? String(v.label).trim() : undefined,
      required: Boolean(v.required),
      automatic: Boolean(v.automatic),
      defaultValue: v.defaultValue ? String(v.defaultValue) : undefined,
    }))
    .filter((v) => /^[a-zA-Z0-9_.-]{1,80}$/.test(v.key));
}

export function extractTemplateVariableKeys(content: string): string[] {
  const keys = new Set<string>();
  for (const match of content.matchAll(/\{\{\s*([a-zA-Z0-9_.-]{1,80})\s*\}\}/g)) keys.add(match[1]);
  return [...keys];
}

export function mergeVariableDefinitions(
  content: string,
  defined: TemplateVariableDefinition[],
): TemplateVariableDefinition[] {
  const builtins = new Map<string, { key: string; label: string; automatic: boolean }>(
    BUILTIN_TEMPLATE_VARIABLES.map((v) => [v.key, v]),
  );
  const existing = new Map<string, TemplateVariableDefinition>(defined.map((v) => [v.key, v]));
  return extractTemplateVariableKeys(content).map((key) => {
    const custom = existing.get(key);
    const builtin = builtins.get(key);
    return {
      key,
      label: custom?.label ?? builtin?.label ?? key.replaceAll("_", " ").replaceAll(".", " · "),
      required: custom?.required ?? !builtin?.automatic,
      automatic: custom?.automatic ?? builtin?.automatic ?? false,
      defaultValue: custom?.defaultValue,
    };
  });
}

function esc(value: unknown) {
  return String(value ?? "");
}

export async function buildAutomaticTemplateContext(args: {
  clientId?: string | null;
  caseId?: string | null;
  documentTitle: string;
}): Promise<Record<string, string>> {
  const [client, caseRow] = await Promise.all([
    args.clientId
      ? prisma.client.findUnique({
          where: { id: args.clientId },
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            country: true,
            nationality: true,
          },
        })
      : null,
    args.caseId
      ? prisma.case.findUnique({ where: { id: args.caseId }, select: { caseNumber: true, title: true } })
      : null,
  ]);
  const fromDocs = args.clientId ? await extractedTemplateContext(args.clientId) : {};
  return {
    ...fromDocs,
    "company.name": "JUN CREATIF AND TRAVEL LLC",
    "client.first_name": esc(client?.firstName),
    "client.last_name": esc(client?.lastName),
    "client.full_name": esc(client ? `${client.firstName} ${client.lastName}`.trim() : ""),
    "client.email": esc(client?.email),
    "client.phone": esc(client?.phone),
    "client.address": esc(client?.address),
    "client.country": esc(client?.country),
    "client.nationality": esc(client?.nationality),
    "case.number": esc(caseRow?.caseNumber),
    "case.title": esc(caseRow?.title),
    "date.today": new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date()),
    "document.title": args.documentTitle,
  };
}

const fmtDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(d) : "";

/**
 * Template values taken from the client's typed documents (most recent of
 * each type wins). Keys stay empty when no document of that type exists, so
 * the editor flags them as unresolved instead of inventing values.
 */
export async function extractedTemplateContext(clientId: string): Promise<Record<string, string>> {
  const rows = await prisma.fileExtraction.findMany({
    where: { file: { clientId, archivedAt: null, isVault: false }, error: null },
    orderBy: { extractedAt: "desc" },
    select: {
      docType: true,
      documentNumber: true,
      issuingCountry: true,
      issuer: true,
      issuedAt: true,
      expiresAt: true,
      dateOfBirth: true,
      amount: true,
      currency: true,
      reference: true,
      fields: true,
    },
  });
  const first = (type: string) => rows.find((r) => r.docType === type);
  const f = (r: (typeof rows)[number] | undefined, key: string) => {
    const v = (r?.fields as Record<string, unknown> | null)?.[key];
    return v === null || v === undefined || typeof v === "object" ? "" : String(v);
  };
  const passport = first("PASSPORT");
  const nid = first("NATIONAL_ID");
  const visa = first("VISA");
  const residence = first("RESIDENCE_PERMIT");
  const employment = first("EMPLOYMENT_LETTER") ?? first("PAY_SLIP");
  const flight = first("FLIGHT_TICKET");
  const hotel = first("HOTEL_BOOKING");
  const insurance = first("TRAVEL_INSURANCE");
  const bank = first("BANK_STATEMENT");
  const birth = first("BIRTH_CERTIFICATE");
  const dob = passport?.dateOfBirth ?? nid?.dateOfBirth ?? birth?.dateOfBirth ?? null;
  return {
    "passport.number": esc(passport?.documentNumber),
    "passport.issuing_country": esc(passport?.issuingCountry),
    "passport.issue_date": fmtDate(passport?.issuedAt),
    "passport.expiry_date": fmtDate(passport?.expiresAt),
    "client.date_of_birth": fmtDate(dob),
    "client.place_of_birth":
      f(birth, "placeOfBirth") || f(passport, "placeOfBirth") || f(passport, "placeOfIssue"),
    "id.number": esc(nid?.documentNumber),
    "visa.number": esc(visa?.documentNumber),
    "visa.expiry_date": fmtDate(visa?.expiresAt),
    "residence.number": esc(residence?.documentNumber),
    "residence.expiry_date": fmtDate(residence?.expiresAt),
    "employer.name": f(employment, "employer") || esc(employment?.issuer),
    "employer.monthly_income": f(employment, "monthlyIncome")
      ? `${f(employment, "monthlyIncome")} ${f(employment, "currency") || esc(employment?.currency)}`.trim()
      : "",
    "trip.from": f(flight, "travelFrom"),
    "trip.to": f(flight, "travelTo"),
    "trip.departure_date": fmtDate(parseIso(f(flight, "departureDate"))),
    "trip.return_date": fmtDate(parseIso(f(flight, "returnDate"))),
    "trip.booking_reference": f(flight, "bookingReference") || esc(flight?.reference),
    "hotel.name": esc(hotel?.issuer) || f(hotel, "issuer"),
    "insurance.company": esc(insurance?.issuer),
    "insurance.expiry_date": fmtDate(insurance?.expiresAt),
    "bank.name": esc(bank?.issuer),
  };
}
function parseIso(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function renderTemplateContent(
  content: string,
  values: Record<string, string>,
): { content: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  const rendered = content.replace(/\{\{\s*([a-zA-Z0-9_.-]{1,80})\s*\}\}/g, (_full, key: string) => {
    const value = values[key];
    if (value === undefined || value === "") {
      unresolved.add(key);
      return `{{${key}}}`;
    }
    return value;
  });
  return { content: rendered, unresolved: [...unresolved] };
}
