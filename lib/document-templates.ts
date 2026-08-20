import "server-only";
import { prisma } from "@/lib/prisma";

export const TEMPLATE_CATEGORIES = [
  ["HR_RECRUITMENT", "Ressources humaines — Recrutement"],
  ["HR_EMPLOYMENT", "Ressources humaines — Contrats et vie du salarié"],
  ["HR_PAYROLL_TRAINING_EXIT", "Ressources humaines — Paie, évaluation, formation, départ"],
  ["SALES", "Commercial et ventes"],
  ["PURCHASING_SUPPLIERS", "Achats et fournisseurs"],
  ["FINANCE_ACCOUNTING", "Finances et comptabilité"],
  ["LEGAL_GOVERNANCE", "Juridique et gouvernance"],
  ["GENERAL_ADMIN", "Administration générale et secrétariat"],
  ["MARKETING_COMMUNICATIONS", "Marketing et communication"],
  ["PROJECTS_OPERATIONS", "Projets et opérations"],
  ["QHSE", "Qualité, hygiène, sécurité, environnement"],
  ["IT_DATA_PROTECTION", "Informatique et protection des données"],
  ["EXECUTIVE_STRATEGY", "Direction et stratégie"],
  ["EXTERNAL_RELATIONS", "Relations externes et divers"],
  ["GENERAL", "Général / personnalisé"],
] as const;

export const TEMPLATE_LANGUAGES = ["FR", "EN", "ES", "HT"] as const;

export const BUILTIN_TEMPLATE_VARIABLES = [
  { key: "company.name", label: "Company name", automatic: true },
  { key: "client.first_name", label: "Client first name", automatic: true },
  { key: "client.last_name", label: "Client last name", automatic: true },
  { key: "client.full_name", label: "Client full name", automatic: true },
  { key: "client.email", label: "Client email", automatic: true },
  { key: "client.phone", label: "Client phone", automatic: true },
  { key: "client.address", label: "Client address", automatic: true },
  { key: "client.country", label: "Client country", automatic: true },
  { key: "client.nationality", label: "Client nationality", automatic: true },
  { key: "case.number", label: "Case number", automatic: true },
  { key: "case.title", label: "Case title", automatic: true },
  { key: "date.today", label: "Today's date", automatic: true },
  { key: "document.title", label: "Document title", automatic: true },
  { key: "amount", label: "Amount", automatic: false },
  { key: "currency", label: "Currency", automatic: false },
  { key: "address", label: "Address", automatic: false },
  { key: "reference", label: "Reference", automatic: false },
] as const;

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

export function mergeVariableDefinitions(content: string, defined: TemplateVariableDefinition[]): TemplateVariableDefinition[] {
  const builtins = new Map(BUILTIN_TEMPLATE_VARIABLES.map((v) => [v.key, v]));
  const existing = new Map(defined.map((v) => [v.key, v]));
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
      ? prisma.client.findUnique({ where: { id: args.clientId }, select: { firstName: true, lastName: true, email: true, phone: true, address: true, country: true, nationality: true } })
      : null,
    args.caseId
      ? prisma.case.findUnique({ where: { id: args.caseId }, select: { caseNumber: true, title: true } })
      : null,
  ]);
  return {
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

export function renderTemplateContent(content: string, values: Record<string, string>): { content: string; unresolved: string[] } {
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
