"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home, Users, MessageCircle, Plus, Menu, FolderKanban, FileText, CreditCard, X } from "lucide-react";
import { cn } from "@/lib/utils";

const quickCreate = [
  { href: "/app/clients/new", label: "Nouveau client", icon: Users },
  { href: "/app/cases/new", label: "Nouveau dossier", icon: FolderKanban },
  { href: "/app/documents/new", label: "Nouveau document", icon: FileText },
  { href: "/app/finance/payments/new", label: "Nouveau paiement", icon: CreditCard },
];

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);

  const items = [
    { href: "/app", label: "Accueil", icon: Home, active: pathname === "/app" },
    {
      href: "/app/clients",
      label: "Clients",
      icon: Users,
      active: pathname === "/app/clients" || pathname.startsWith("/app/clients/"),
    },
    {
      href: "/app/whatsapp/inbox",
      label: "WhatsApp",
      icon: MessageCircle,
      active: pathname.startsWith("/app/whatsapp"),
    },
  ];

  return (
    <>
      {createOpen ? (
        <div
          className="fixed inset-0 z-40 bg-night/65 backdrop-blur-sm lg:hidden"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="absolute bottom-[86px] left-3 right-3 rounded-2xl border border-line bg-surface-1 p-3 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <p className="text-sm font-semibold text-ink">Créer rapidement</p>
                <p className="text-[11px] text-ink-3">Choisissez ce que vous voulez ajouter.</p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-2 text-ink-3 hover:bg-ink/[0.06] hover:text-ink"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickCreate.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setCreateOpen(false)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-ink/[0.03] p-3 text-sm font-medium text-ink transition hover:border-blue-400/25 hover:bg-blue-500/[0.08]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-accent">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-card backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {items.slice(0, 2).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition",
                item.active ? "text-accent" : "text-ink-3 hover:text-ink-2",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="mx-auto -mt-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/25 bg-blue-600 text-white shadow-xl shadow-blue-950/50 transition hover:bg-blue-500"
            aria-label="Créer"
          >
            <Plus className="h-6 w-6" />
          </button>

          <Link
            href={items[2].href}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition",
              items[2].active ? "text-success" : "text-ink-3 hover:text-ink-2",
            )}
          >
            <MessageCircle className="h-5 w-5" />
            <span>WhatsApp</span>
          </Link>

          <button
            type="button"
            onClick={onOpenMenu}
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-ink-3 transition hover:text-ink-2"
            aria-label="Ouvrir le menu complet"
          >
            <Menu className="h-5 w-5" />
            <span>Plus</span>
          </button>
        </div>
      </nav>
    </>
  );
}
