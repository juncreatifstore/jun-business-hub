import "server-only";
import { prisma } from "@/lib/prisma";
import { DOC_TYPES, type DocType } from "@/lib/file-extraction";

/**
 * Document checklists per case type. Case.type is free text, so each profile
 * matches by keywords (case-insensitive, accents ignored). Stored in
 * AppSetting `drive.requirements` once customised; defaults below otherwise.
 */
export type RequirementProfile = {
  key: string;
  label: string;
  keywords: string[];
  required: DocType[];
  optional: DocType[];
};

export const REQUIREMENTS_KEY = "drive.requirements";

export const DEFAULT_PROFILES: RequirementProfile[] = [
  {
    key: "tourist_visa",
    label: "Visa touristique",
    keywords: [
      "visa tour",
      "tourist",
      "touristique",
      "visiteur",
      "visitor",
      "schengen",
      "b1",
      "b2",
      "esta",
      "eta",
    ],
    required: ["PASSPORT", "PHOTO", "BANK_STATEMENT", "FLIGHT_TICKET", "HOTEL_BOOKING", "TRAVEL_INSURANCE"],
    optional: ["EMPLOYMENT_LETTER", "PAY_SLIP", "INVITATION_LETTER", "FORM"],
  },
  {
    key: "student_visa",
    label: "Visa étudiant",
    keywords: ["etudiant", "student", "etude", "study", "f1", "permis d'etude"],
    required: ["PASSPORT", "PHOTO", "DIPLOMA", "BANK_STATEMENT", "LETTER"],
    optional: ["TRAVEL_INSURANCE", "POLICE_RECORD", "FORM", "BIRTH_CERTIFICATE"],
  },
  {
    key: "work_visa",
    label: "Visa / permis de travail",
    keywords: ["travail", "work", "emploi", "employment", "h1b", "h2", "permis de travail", "sponsor"],
    required: ["PASSPORT", "PHOTO", "EMPLOYMENT_LETTER", "CONTRACT", "DIPLOMA"],
    optional: ["POLICE_RECORD", "PAY_SLIP", "BANK_STATEMENT", "FORM"],
  },
  {
    key: "family",
    label: "Regroupement familial",
    keywords: [
      "famil",
      "family",
      "regroupement",
      "conjoint",
      "spouse",
      "mariage",
      "marriage",
      "reunification",
    ],
    required: ["PASSPORT", "PHOTO", "BIRTH_CERTIFICATE", "MARRIAGE_CERTIFICATE", "BANK_STATEMENT"],
    optional: ["POLICE_RECORD", "EMPLOYMENT_LETTER", "RESIDENCE_PERMIT", "FORM"],
  },
  {
    key: "residence",
    label: "Résidence / titre de séjour",
    keywords: [
      "residence",
      "sejour",
      "titre",
      "carte",
      "green card",
      "permanent",
      "naturalisation",
      "citizenship",
    ],
    required: ["PASSPORT", "PHOTO", "BIRTH_CERTIFICATE", "POLICE_RECORD", "BANK_STATEMENT"],
    optional: ["MARRIAGE_CERTIFICATE", "EMPLOYMENT_LETTER", "TAX_DOCUMENT", "FORM"],
  },
  {
    key: "travel",
    label: "Voyage / billetterie",
    keywords: ["travel", "voyage", "vol", "flight", "billet", "ticket", "hotel", "sejour organise", "tour"],
    required: ["PASSPORT", "FLIGHT_TICKET"],
    optional: ["HOTEL_BOOKING", "TRAVEL_INSURANCE", "VISA", "PAYMENT_PROOF"],
  },
  {
    key: "refund",
    label: "Remboursement",
    keywords: ["refund", "rembours", "annulation", "cancel"],
    required: ["PAYMENT_PROOF", "RECEIPT"],
    optional: ["INVOICE", "FLIGHT_TICKET", "LETTER", "NATIONAL_ID"],
  },
  {
    key: "documents",
    label: "Documents / démarches",
    keywords: [
      "document",
      "demarche",
      "legalis",
      "apostille",
      "traduction",
      "translation",
      "notar",
      "procuration",
    ],
    required: ["NATIONAL_ID"],
    optional: ["PASSPORT", "BIRTH_CERTIFICATE", "POWER_OF_ATTORNEY", "CONTRACT", "FORM"],
  },
  {
    key: "default",
    label: "Autre",
    keywords: [],
    required: ["PASSPORT", "PHOTO"],
    optional: ["BANK_STATEMENT", "EMPLOYMENT_LETTER"],
  },
];

function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isDocType(v: unknown): v is DocType {
  return typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);
}

export async function loadRequirementProfiles(): Promise<RequirementProfile[]> {
  const row = await prisma.appSetting.findUnique({
    where: { key: REQUIREMENTS_KEY },
    select: { value: true },
  });
  if (!row) return DEFAULT_PROFILES;
  try {
    const parsed = JSON.parse(row.value) as RequirementProfile[];
    const clean = parsed
      .filter((p) => p && typeof p.key === "string" && typeof p.label === "string")
      .map((p) => ({
        key: p.key.slice(0, 40),
        label: p.label.slice(0, 80),
        keywords: Array.isArray(p.keywords) ? p.keywords.map((k) => String(k).slice(0, 40)).slice(0, 30) : [],
        required: Array.isArray(p.required) ? p.required.filter(isDocType) : [],
        optional: Array.isArray(p.optional) ? p.optional.filter(isDocType) : [],
      }));
    return clean.length ? clean : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export async function saveRequirementProfiles(profiles: RequirementProfile[]) {
  const value = JSON.stringify(profiles);
  await prisma.appSetting.upsert({
    where: { key: REQUIREMENTS_KEY },
    create: { key: REQUIREMENTS_KEY, value },
    update: { value },
  });
}

/** Picks the profile for a free-text case type (first keyword match; 'default' otherwise). */
export function profileForCaseType(profiles: RequirementProfile[], caseType: string | null | undefined) {
  const t = norm(caseType ?? "");
  return (
    profiles.find((p) => p.key !== "default" && p.keywords.some((k) => t.includes(norm(k)))) ??
    profiles.find((p) => p.key === "default") ??
    profiles[0]
  );
}

export type ChecklistItem = {
  docType: DocType;
  required: boolean;
  status: "present" | "expiring" | "expired" | "missing";
  fileId: string | null;
  fileName: string | null;
  expiresAt: Date | null;
  source: "case" | "client" | null;
};

/**
 * Checklist for a case: a piece counts as present when a file of that type is
 * attached to the case or to the client (identity documents live at client level).
 */
export async function caseChecklist(caseId: string) {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: { id: true, type: true, clientId: true },
  });
  if (!c) return null;
  const [profiles, files] = await Promise.all([
    loadRequirementProfiles(),
    prisma.file.findMany({
      where: { archivedAt: null, isVault: false, OR: [{ caseId }, { clientId: c.clientId }] },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        caseId: true,
        extraction: { select: { docType: true, expiresAt: true } },
      },
    }),
  ]);
  const profile = profileForCaseType(profiles, c.type);
  const byType = new Map<string, (typeof files)[number]>();
  for (const f of files) {
    const t = f.extraction?.docType ?? "OTHER";
    // Prefer a file attached to this case, else the most recent client-level one.
    const cur = byType.get(t);
    if (!cur || (f.caseId === caseId && cur.caseId !== caseId)) byType.set(t, f);
  }
  const build = (docType: DocType, required: boolean): ChecklistItem => {
    const f = byType.get(docType);
    if (!f)
      return {
        docType,
        required,
        status: "missing",
        fileId: null,
        fileName: null,
        expiresAt: null,
        source: null,
      };
    const exp = f.extraction?.expiresAt ?? null;
    const days = exp ? (exp.getTime() - Date.now()) / 86_400_000 : null;
    return {
      docType,
      required,
      status: days === null ? "present" : days < 0 ? "expired" : days <= 90 ? "expiring" : "present",
      fileId: f.id,
      fileName: f.name,
      expiresAt: exp,
      source: f.caseId === caseId ? "case" : "client",
    };
  };
  const items = [
    ...profile.required.map((t) => build(t, true)),
    ...profile.optional.map((t) => build(t, false)),
  ];
  const requiredItems = items.filter((i) => i.required);
  const done = requiredItems.filter((i) => i.status === "present" || i.status === "expiring").length;
  return { profile, items, done, total: requiredItems.length };
}

/** Union of required pieces across a client's open cases (fallback: default profile). */
export async function clientRequiredDocTypes(clientId: string): Promise<DocType[]> {
  const [profiles, cases] = await Promise.all([
    loadRequirementProfiles(),
    prisma.case.findMany({
      where: { clientId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } },
      select: { type: true },
    }),
  ]);
  const set = new Set<DocType>();
  const list = cases.length
    ? cases.map((c) => profileForCaseType(profiles, c.type))
    : [profileForCaseType(profiles, "")];
  for (const p of list) for (const t of p.required) set.add(t);
  return Array.from(set);
}
