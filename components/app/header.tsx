"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Search, Bell, Plus, LogOut, ChevronDown, Command, Settings, UserRound } from "lucide-react";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "./theme";
import { CommandPalette } from "./command-palette";

const quickCreate = [
  { href: "/app/clients/new", label: "Nouveau client" },
  { href: "/app/cases/new", label: "Nouveau dossier" },
  { href: "/app/tasks/new", label: "Nouvelle tâche" },
  { href: "/app/documents/new", label: "Nouveau document" },
  { href: "/app/finance/payments/new", label: "Nouveau paiement" },
  { href: "/app/finance/refunds/new", label: "Nouveau remboursement" },
];

export function Header({
  user,
  unread,
  onMenu,
}: {
  user: { firstName: string; lastName: string; role: string };
  unread: number;
  onMenu: () => void;
}) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCreateOpen(false);
        setProfileOpen(false);
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCreateOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2.5 border-b border-line bg-canvas/85 px-3 text-ink backdrop-blur-md sm:px-6">
        <button
          className="rounded-lg p-2.5 text-ink-2 transition hover:bg-ink/[0.06] hover:text-ink lg:hidden"
          onClick={onMenu}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => {
            setCommandOpen(true);
            setCreateOpen(false);
            setProfileOpen(false);
          }}
          className="group relative flex h-9 min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-surface-1 px-3 text-left transition hover:border-line-strong md:max-w-xl"
          aria-label="Ouvrir la recherche et les commandes"
        >
          <Search className="h-4 w-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate text-sm text-ink-3">
            Rechercher ou lancer une commande…
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-ink-3 sm:flex">
            <Command className="h-3 w-3" /> K
          </span>
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setCreateOpen(!createOpen);
              setProfileOpen(false);
            }}
            className="flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg shadow-card transition hover:bg-accent/90 sm:px-4"
            aria-label="Créer"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Créer</span>
            <ChevronDown className="hidden h-3.5 w-3.5 opacity-75 sm:block" />
          </button>
          {createOpen ? (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface-3 py-1.5 shadow-pop">
              <p className="px-4 pb-1.5 pt-2 text-xs text-ink-3">Créer rapidement</p>
              {quickCreate.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setCreateOpen(false)}
                  className="block px-4 py-2 text-sm text-ink transition hover:bg-surface-2"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <ThemeToggle className="hidden sm:flex" />

        <Link
          href="/app/notifications"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-1 text-ink-2 transition hover:bg-surface-2 hover:text-ink"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-canvas bg-danger px-1 text-2xs font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>

        <div className="relative">
          <button
            onClick={() => {
              setProfileOpen(!profileOpen);
              setCreateOpen(false);
            }}
            className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface-1 py-1 pl-1 pr-2 transition hover:bg-surface-2"
            aria-label="Menu utilisateur"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-night text-2xs font-semibold text-white">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <span className="hidden max-w-[120px] text-left xl:block">
              <span className="block truncate text-xs font-semibold text-ink">
                {user.firstName} {user.lastName}
              </span>
              <span className="block truncate text-2xs text-ink-3">{user.role.replaceAll("_", " ")}</span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-ink-3 xl:block" />
          </button>

          {profileOpen ? (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface-3 py-2 shadow-pop">
              <div className="border-b border-line px-4 pb-3 pt-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="mt-0.5 truncate text-2xs text-ink-3">{user.role.replaceAll("_", " ")}</p>
                  </div>
                </div>
              </div>

              <Link
                href="/app/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-1 flex items-center gap-2 px-4 py-2 text-sm text-ink transition hover:bg-surface-2"
              >
                <Settings className="h-4 w-4" /> Paramètres
              </Link>

              <form action={logout} className="border-t border-line pt-1">
                <button className="flex w-full items-center gap-2 px-4 py-2 text-sm text-danger transition hover:bg-danger/10">
                  <LogOut className="h-4 w-4" /> Se déconnecter
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
    </>
  );
}
