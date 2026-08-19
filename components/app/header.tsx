"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search, Bell, Plus, LogOut, ChevronDown } from "lucide-react";
import { logout } from "@/app/login/actions";

const quickCreate = [
  { href: "/app/clients/new", label: "Client" },
  { href: "/app/cases/new", label: "Case" },
  { href: "/app/tasks/new", label: "Task" },
  { href: "/app/documents/new", label: "Document" },
  { href: "/app/finance/payments/new", label: "Payment" },
  { href: "/app/finance/refunds/new", label: "Refund" },
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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
      <button className="lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
      <form
        className="relative flex-1 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/app/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search clients, cases, documents, payments…"
          className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-electric"
        />
      </form>
      <div className="relative">
        <button
          onClick={() => { setCreateOpen(!createOpen); setProfileOpen(false); }}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-electric px-3 text-sm font-medium text-white hover:brightness-110"
        >
          <Plus className="h-4 w-4" /> Create <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {createOpen ? (
          <div className="absolute right-0 mt-2 w-44 rounded-xl border border-line bg-white py-1.5 shadow-lg">
            {quickCreate.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setCreateOpen(false)}
                className="block px-4 py-2 text-sm hover:bg-surface">
                {i.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <Link href="/app/notifications" className="relative rounded-lg p-2 hover:bg-surface" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
      <div className="relative">
        <button
          onClick={() => { setProfileOpen(!profileOpen); setCreateOpen(false); }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-night text-xs font-semibold text-white"
        >
          {user.firstName[0]}{user.lastName[0]}
        </button>
        {profileOpen ? (
          <div className="absolute right-0 mt-2 w-52 rounded-xl border border-line bg-white py-2 shadow-lg">
            <div className="border-b border-line px-4 pb-2">
              <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-muted2">{user.role.replaceAll("_", " ")}</p>
            </div>
            <form action={logout}>
              <button className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-surface">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
