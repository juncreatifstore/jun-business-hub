"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Search, Bell, Plus, LogOut, ChevronDown, Command, Settings, UserRound } from "lucide-react";
import { logout } from "@/app/login/actions";
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
      <header className="sticky top-0 z-30 flex h-[72px] items-center gap-2.5 border-b border-white/[0.06] bg-[#09111f]/92 px-3 text-white shadow-[0_8px_30px_rgba(0,0,0,.12)] backdrop-blur-xl sm:px-6">
        <button
          className="rounded-xl p-2.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
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
          className="group relative flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-left transition hover:border-blue-500/25 hover:bg-white/[0.055] md:max-w-2xl"
          aria-label="Ouvrir la recherche et les commandes"
        >
          <Search className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:text-blue-400" />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-600 group-hover:text-slate-400">
            Rechercher ou lancer une commande…
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[10px] text-slate-500 sm:flex">
            <Command className="h-3 w-3" /> K
          </span>
        </button>

        <div className="relative">
          <button
            onClick={() => {
              setCreateOpen(!createOpen);
              setProfileOpen(false);
            }}
            className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 sm:px-4"
            aria-label="Créer"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Créer</span>
            <ChevronDown className="hidden h-3.5 w-3.5 opacity-75 sm:block" />
          </button>
          {createOpen ? (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101827]/98 py-1.5 shadow-2xl shadow-black/45 backdrop-blur-xl">
              <div className="px-4 pb-2 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Créer rapidement
                </p>
              </div>
              {quickCreate.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setCreateOpen(false)}
                  className="block px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <Link
          href="/app/notifications"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition hover:bg-white/[0.055] hover:text-white"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#09111f] bg-red-500 px-1 text-[10px] font-bold text-white">
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
            className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1.5 pr-2 transition hover:bg-white/[0.055]"
            aria-label="Menu utilisateur"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-[11px] font-bold text-white ring-1 ring-white/10">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <span className="hidden max-w-[120px] text-left xl:block">
              <span className="block truncate text-xs font-semibold text-slate-200">
                {user.firstName} {user.lastName}
              </span>
              <span className="block truncate text-[9px] uppercase tracking-[0.12em] text-slate-600">
                {user.role.replaceAll("_", " ")}
              </span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-slate-500 xl:block" />
          </button>

          {profileOpen ? (
            <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101827]/98 py-2 shadow-2xl shadow-black/45 backdrop-blur-xl">
              <div className="border-b border-white/[0.07] px-4 pb-3 pt-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.05] text-slate-300">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.13em] text-slate-500">
                      {user.role.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
              </div>

              <Link
                href="/app/settings"
                onClick={() => setProfileOpen(false)}
                className="mt-1 flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                <Settings className="h-4 w-4" /> Paramètres
              </Link>

              <form action={logout} className="border-t border-white/[0.06] pt-1">
                <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300">
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
