"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Home } from "lucide-react";

const ROOTS = new Set([
  "/app",
  "/app/mail",
  "/app/drive",
  "/app/documents",
  "/app/signatures",
  "/app/clients",
  "/app/cases",
  "/app/tasks",
  "/app/finance",
  "/app/ai",
  "/app/vault",
  "/app/team",
  "/app/departments",
  "/app/audit",
  "/app/settings",
  "/app/notifications",
  "/app/whatsapp/inbox",
  "/app/company-funds",
]);

const labels: Record<string, string> = {
  app: "Accueil",
  clients: "Clients",
  cases: "Dossiers",
  tasks: "Tâches",
  documents: "Documents",
  signatures: "Signatures",
  drive: "Drive",
  vault: "Vault",
  finance: "Finance",
  payments: "Paiements",
  receipts: "Reçus",
  refunds: "Remboursements",
  reports: "Rapports",
  invoices: "Factures",
  expenses: "Dépenses",
  ai: "JUN AI",
  team: "Équipe",
  departments: "Départements",
  audit: "Audit",
  settings: "Paramètres",
  mail: "Mail",
  notifications: "Notifications",
  whatsapp: "WhatsApp",
  inbox: "Inbox",
  search: "Recherche",
  new: "Nouveau",
  edit: "Modifier",
  dashboard: "Vue 360",
  services: "Services",
  profitability: "Rentabilité",
  history: "Historique",
  statement: "Relevé",
  account: "Compte financier",
  relationship: "Relation client",
  finalize: "Finalisation",
  templates: "Modèles",
  "company-funds": "Company Funds",
  executive: "Direction",
  consolidation: "Consolidation",
  reconciliation: "Réconciliation",
  "monthly-close": "Clôture",
  transfers: "Transferts",
  reserves: "Réserves",
  authorizations: "Autorisations",
  "execution-evidence": "Preuves",
};

function prettySegment(segment: string) {
  if (labels[segment]) return labels[segment];
  if (/^[0-9a-f-]{20,}$/i.test(segment) || segment.length > 24) return "Détail";
  return decodeURIComponent(segment)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ContextBack() {
  const pathname = usePathname();
  const router = useRouter();
  if (!pathname || ROOTS.has(pathname)) return null;

  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.slice(1).map((segment, index) => ({
    segment,
    label: prettySegment(segment),
    href: `/${parts.slice(0, index + 2).join("/")}`,
  }));

  return (
    <div className="mb-5 flex min-w-0 items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.push("/app");
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-ink/[0.025] text-ink-3 transition hover:bg-ink/[0.055] hover:text-ink"
        aria-label="Retour"
        title="Retour"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <nav
        aria-label="Fil d’Ariane"
        className="min-w-0 overflow-hidden rounded-xl border border-line bg-ink/[0.02] px-3 py-2"
      >
        <ol className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs">
          <li className="shrink-0">
            <Link href="/app" className="flex items-center gap-1 text-ink-3 transition hover:text-accent">
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Accueil</span>
            </Link>
          </li>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.href}-${index}`} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-2" />
                {last ? (
                  <span className="max-w-[180px] truncate font-medium text-ink-2 sm:max-w-[280px]">
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="max-w-[140px] truncate text-ink-3 transition hover:text-accent sm:max-w-[220px]"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
