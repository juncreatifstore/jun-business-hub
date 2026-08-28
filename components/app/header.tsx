"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search, Bell, Plus, LogOut, ChevronDown, Command } from "lucide-react";
import { logout } from "@/app/login/actions";

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
  const router = useRouter();
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-white/[0.06] bg-[#09111f]/95 px-4 text-white shadow-sm backdrop-blur-xl sm:px-6">
      <button className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white lg:hidden" onClick={onMenu} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>

      <form
        className="relative min-w-0 flex-1 md:max-w-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/app/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher clients, dossiers, documents, paiements…"
          className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-10 pr-16 text-sm text-slate-100 outline-none placeholder:text-slate-600 transition focus:border-blue-500/40 focus:bg-white/[0.055] focus:ring-2 focus:ring-blue-500/10"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[10px] text-slate-500 sm:flex">
          <Command className="h-3 w-3" /> K
        </span>
      </form>

      <div className="relative hidden sm:block">
        <button
          onClick={() => { setCreateOpen(!createOpen); setProfileOpen(false); }}
          className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" /> Créer <ChevronDown className="h-3.5 w-3.5 opacity-75" />
        </button>
        {createOpen ? (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101827] py-1.5 shadow-2xl shadow-black/40">
            {quickCreate.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setCreateOpen(false)} className="block px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white">
                {i.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <Link href="/app/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition hover:bg-white/[0.055] hover:text-white" aria-label="Notifications">
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#09111f] bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>

      <div className="relative">
        <button
          onClick={() => { setProfileOpen(!profileOpen); setCreateOpen(false); }}
          className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1.5 pr-2 transition hover:bg-white/[0.055]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-[11px] font-bold text-white ring-1 ring-white/10">
            {user.firstName[0]}{user.lastName[0]}
          </span>
          <span className="hidden max-w-[120px] text-left lg:block">
            <span className="block truncate text-xs font-semibold text-slate-200">{user.firstName} {user.lastName}</span>
            <span className="block truncate text-[9px] uppercase tracking-[0.12em] text-slate-600">{user.role.replaceAll("_", " ")}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-slate-500 lg:block" />
        </button>
        {profileOpen ? (
          <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101827] py-2 shadow-2xl shadow-black/40">
            <div className="border-b border-white/[0.07] px-4 pb-3 pt-1">
              <p className="text-sm font-semibold text-slate-100">{user.firstName} {user.lastName}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.13em] text-slate-500">{user.role.replaceAll("_", " ")}</p>
            </div>
            <form action={logout} className="pt-1">
              <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10 hover:text-red-300">
                <LogOut className="h-4 w-4" /> Se déconnecter
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
