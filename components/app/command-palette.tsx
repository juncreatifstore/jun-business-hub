"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CheckSquare,
  CircleDollarSign,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Signature,
  Sparkles,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  group: "Navigation" | "Créer" | "Finance" | "Communication";
  icon: typeof Search;
  keywords?: string;
};

const items: CommandItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    description: "Ouvrir la vue générale",
    href: "/app",
    group: "Navigation",
    icon: LayoutDashboard,
    keywords: "accueil home",
  },
  {
    id: "clients",
    label: "Clients",
    description: "Registre et dossiers clients",
    href: "/app/clients",
    group: "Navigation",
    icon: Users,
    keywords: "client customer",
  },
  {
    id: "cases",
    label: "Dossiers",
    description: "Services et dossiers opérationnels",
    href: "/app/cases",
    group: "Navigation",
    icon: FolderKanban,
    keywords: "case service",
  },
  {
    id: "documents",
    label: "Documents",
    description: "Documents officiels JUN",
    href: "/app/documents",
    group: "Navigation",
    icon: FileText,
    keywords: "pdf contrat agreement",
  },
  {
    id: "signatures",
    label: "Signatures",
    description: "JUN Secure Sign",
    href: "/app/signatures",
    group: "Navigation",
    icon: Signature,
    keywords: "signature signer",
  },
  {
    id: "ai",
    label: "JUN AI",
    description: "Assistant interne",
    href: "/app/ai",
    group: "Navigation",
    icon: Sparkles,
    keywords: "assistant intelligence",
  },
  {
    id: "reports",
    label: "Rapports financiers",
    description: "Rapports et analyses",
    href: "/app/finance/reports",
    group: "Finance",
    icon: BarChart3,
    keywords: "report finance",
  },
  {
    id: "payments",
    label: "Paiements",
    description: "Encaissements et validations",
    href: "/app/finance/payments",
    group: "Finance",
    icon: CreditCard,
    keywords: "payment argent money",
  },
  {
    id: "refunds",
    label: "Remboursements",
    description: "Demandes et décaissements",
    href: "/app/finance/refunds",
    group: "Finance",
    icon: Undo2,
    keywords: "refund remboursement",
  },
  {
    id: "whatsapp",
    label: "WhatsApp Inbox",
    description: "Conversations clients",
    href: "/app/whatsapp/inbox",
    group: "Communication",
    icon: MessageCircle,
    keywords: "message chat",
  },
  {
    id: "mail",
    label: "Mail",
    description: "Boîte email JUN",
    href: "/app/mail",
    group: "Communication",
    icon: Mail,
    keywords: "email inbox",
  },
  {
    id: "settings",
    label: "Paramètres",
    description: "Configuration de l’application",
    href: "/app/settings",
    group: "Navigation",
    icon: Settings,
    keywords: "settings configuration",
  },
  {
    id: "new-client",
    label: "Nouveau client",
    description: "Créer une fiche client",
    href: "/app/clients/new",
    group: "Créer",
    icon: Users,
    keywords: "create add client",
  },
  {
    id: "new-case",
    label: "Nouveau dossier",
    description: "Ouvrir un service ou dossier",
    href: "/app/cases/new",
    group: "Créer",
    icon: FolderKanban,
    keywords: "create case service",
  },
  {
    id: "new-task",
    label: "Nouvelle tâche",
    description: "Ajouter une tâche interne",
    href: "/app/tasks/new",
    group: "Créer",
    icon: CheckSquare,
    keywords: "create task",
  },
  {
    id: "new-document",
    label: "Nouveau document",
    description: "Créer un document officiel",
    href: "/app/documents/new",
    group: "Créer",
    icon: FileText,
    keywords: "create document",
  },
  {
    id: "new-payment",
    label: "Nouveau paiement",
    description: "Enregistrer un encaissement",
    href: "/app/finance/payments/new",
    group: "Créer",
    icon: CircleDollarSign,
    keywords: "create payment",
  },
  {
    id: "new-refund",
    label: "Nouveau remboursement",
    description: "Créer une demande de remboursement",
    href: "/app/finance/refunds/new",
    group: "Créer",
    icon: Undo2,
    keywords: "create refund",
  },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? items
          .filter((item) =>
            `${item.label} ${item.description} ${item.keywords ?? ""} ${item.group}`
              .toLowerCase()
              .includes(normalized),
          )
          .slice(0, 10)
      : items.slice(0, 12);
    const searchItem: CommandItem | null = normalized
      ? {
          id: "global-search",
          label: `Rechercher “${query.trim()}”`,
          description: "Chercher dans clients, dossiers, documents et finance",
          href: `/app/search?q=${encodeURIComponent(query.trim())}`,
          group: "Navigation",
          icon: Search,
        }
      : null;
    return searchItem ? [searchItem, ...matches] : matches;
  }, [query]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);
  function openItem(item: CommandItem) {
    onOpenChange(false);
    router.push(item.href);
  }
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/72 p-0 backdrop-blur-sm sm:items-start sm:px-6 sm:pt-[9vh]"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="flex max-h-[min(88dvh,760px)] w-full flex-col overflow-hidden rounded-t-[22px] border border-white/[0.1] bg-[#0c1524]/98 pb-[env(safe-area-inset-bottom)] shadow-[0_35px_90px_rgba(0,0,0,.58)] ring-1 ring-black/30 sm:max-w-2xl sm:rounded-[22px] sm:pb-0"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />
        <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-4 sm:px-5">
          <Search className="h-5 w-5 shrink-0 text-blue-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => Math.min(results.length - 1, current + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
              }
              if (event.key === "Enter" && results[activeIndex]) {
                event.preventDefault();
                openItem(results[activeIndex]);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
              }
            }}
            placeholder="Rechercher ou lancer une commande…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-600 sm:h-16 sm:text-[15px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-lg p-2 text-slate-600 hover:bg-white/[0.05] hover:text-slate-300"
              aria-label="Effacer"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-slate-500 sm:hidden"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
          <kbd className="hidden rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[10px] text-slate-500 sm:block">
            ESC
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3">
          {results.length ? (
            results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openItem(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                  activeIndex === index
                    ? "bg-blue-500/12 text-white"
                    : "text-slate-300 hover:bg-white/[0.045]",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                    activeIndex === index
                      ? "border-blue-400/20 bg-blue-500/12 text-blue-300"
                      : "border-white/[0.06] bg-white/[0.025] text-slate-500",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-600">{item.description}</span>
                </span>
                <span className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-700 sm:block">
                  {item.group}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <Search className="mx-auto h-6 w-6 text-slate-700" />
              <p className="mt-3 text-sm font-medium text-slate-300">Aucune commande correspondante</p>
              <p className="mt-1 text-xs text-slate-600">Utilisez la recherche globale avec votre texte.</p>
              {query.trim() ? (
                <button
                  type="button"
                  onClick={() =>
                    openItem({
                      id: "global-search-fallback",
                      label: query,
                      description: "",
                      href: `/app/search?q=${encodeURIComponent(query.trim())}`,
                      group: "Navigation",
                      icon: Search,
                    })
                  }
                  className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="mr-1 inline h-3.5 w-3.5" />
                  Rechercher partout
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-black/[0.08] px-5 py-2.5 text-[10px] text-slate-600 sm:flex">
          <span>↑↓ naviguer · ↵ ouvrir · esc fermer</span>
          <span>JUN Business Hub Command Center</span>
        </div>
      </div>
    </div>
  );
}
