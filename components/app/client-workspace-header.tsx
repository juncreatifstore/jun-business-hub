"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  FileText,
  FolderKanban,
  History,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  ReceiptText,
  ShieldAlert,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ClientWorkspaceHeaderProps = {
  client: {
    id: string;
    internalId: string;
    firstName: string;
    lastName: string;
    status: string;
    email?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    country?: string | null;
    createdAt: Date | string;
  };
  tags?: Array<{ id: string; tag: string }>;
  isPartner?: boolean;
  blocked?: boolean;
  hasDebt?: boolean;
  canUpdate?: boolean;
  newServicesAllowed?: boolean;
  paymentsAllowed?: boolean;
};

const tabs = [
  { key: "dashboard", label: "Vue 360", icon: UserRound, path: "dashboard" },
  { key: "services", label: "Services", icon: FolderKanban, path: "services" },
  { key: "finance", label: "Finance", icon: CircleDollarSign, path: "finance" },
  { key: "documents", label: "Documents", icon: FileText, path: "documents" },
  { key: "whatsapp", label: "Communications", icon: MessageCircle, path: "whatsapp" },
  { key: "history", label: "Historique", icon: History, path: "history" },
  { key: "profile", label: "Profil", icon: UserRound, path: "" },
] as const;

function initials(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || "CL";
}

function activeTab(pathname: string, clientId: string) {
  const base = `/app/clients/${clientId}`;
  if (pathname === base || pathname === `${base}/edit`) return "profile";
  const match = tabs.find((tab) => tab.path && (pathname === `${base}/${tab.path}` || pathname.startsWith(`${base}/${tab.path}/`)));
  return match?.key ?? "dashboard";
}

export function ClientWorkspaceHeader({
  client,
  tags = [],
  isPartner = false,
  blocked = false,
  hasDebt = false,
  canUpdate = false,
  newServicesAllowed = true,
  paymentsAllowed = true,
}: ClientWorkspaceHeaderProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const current = activeTab(pathname, client.id);
  const base = `/app/clients/${client.id}`;
  const since = new Date(client.createdAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" });

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-white/[0.075] bg-[radial-gradient(circle_at_85%_5%,rgba(59,130,246,.13),transparent_28%),linear-gradient(145deg,#0f1929,#0b1422_60%,#0a121f)] shadow-[0_22px_55px_rgba(0,0,0,.22)]">
      <div className="relative px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative shrink-0">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/20 bg-gradient-to-br from-blue-500/25 to-indigo-500/10 text-lg font-bold text-blue-100 shadow-lg shadow-blue-950/30 sm:h-16 sm:w-16 sm:text-xl">
                {initials(client.firstName, client.lastName)}
              </div>
              <span className={cn("absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-[#0f1929]", client.status === "ACTIVE" ? "bg-emerald-400" : client.status === "LEAD" ? "bg-blue-400" : "bg-slate-500")} />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{client.firstName} {client.lastName}</h1>
                <StatusBadge status={client.status} />
                {isPartner ? <Badge className="border border-emerald-400/20 bg-emerald-500/10 text-emerald-300">PARTNER</Badge> : null}
                {hasDebt ? <Badge className="border border-amber-400/20 bg-amber-500/10 text-amber-300">SOLDE DÛ</Badge> : null}
                {blocked ? <Badge className="border border-red-400/20 bg-red-500/12 text-red-300">RELATION TERMINÉE</Badge> : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
                <span className="registry-id text-slate-300">{client.internalId}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-slate-600" /> Client depuis {since}</span>
                {client.country ? <span>{client.country}</span> : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {client.email ? <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"><Mail className="h-3.5 w-3.5" /> <span className="max-w-[220px] truncate">{client.email}</span></a> : null}
                {client.phone ? <a href={`tel:${client.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"><Phone className="h-3.5 w-3.5" /> {client.phone}</a> : null}
                {client.whatsapp ? <Link href={`${base}/whatsapp`} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.06] px-2.5 py-1.5 text-emerald-300 transition hover:bg-emerald-500/10"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Link> : null}
              </div>

              {tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{tags.slice(0, 6).map((tag) => <Badge key={tag.id} className="border border-white/[0.07] bg-white/[0.03] text-slate-400">{tag.tag}</Badge>)}</div> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {newServicesAllowed ? (
              <Link href={`/app/cases/new?clientId=${client.id}`} className={buttonVariants({ variant: "primary" }) + " rounded-xl shadow-lg shadow-blue-950/25"}>Nouveau dossier</Link>
            ) : (
              <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-400/15 bg-amber-500/[0.07] px-3 text-xs font-medium text-amber-300"><ShieldAlert className="h-4 w-4" /> Services bloqués</span>
            )}
            {paymentsAllowed ? <Link href={`/app/finance/payments/new?clientId=${client.id}`} className={buttonVariants({ variant: "outline" }) + " rounded-xl"}><WalletCards className="h-4 w-4" /> Paiement</Link> : null}

            <div className="relative">
              <button type="button" onClick={() => setMoreOpen((value) => !value)} className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-xl px-3")} aria-expanded={moreOpen} aria-label="Plus d’actions">
                <MoreHorizontal className="h-4 w-4" /><span className="hidden sm:inline">Plus</span><ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>

              {moreOpen ? (
                <>
                  <button className="fixed inset-0 z-40 cursor-default" aria-label="Fermer le menu" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111b2b]/98 py-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
                    <Action href={`${base}/statement`} icon={ReceiptText} label="Relevé client" onClick={() => setMoreOpen(false)} />
                    <Action href={`${base}/account`} icon={WalletCards} label="Compte financier" onClick={() => setMoreOpen(false)} />
                    <Action href={`${base}/profitability`} icon={CircleDollarSign} label="Rentabilité" onClick={() => setMoreOpen(false)} />
                    <Action href={`${base}/relationship`} icon={ShieldAlert} label="Gestion de la relation" onClick={() => setMoreOpen(false)} />
                    {canUpdate ? <><div className="my-1 border-t border-white/[0.06]" /><Action href={`${base}/edit`} icon={Pencil} label="Modifier le profil" onClick={() => setMoreOpen(false)} /></> : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.06] bg-black/[0.06] px-2 sm:px-4">
        <nav className="flex min-w-0 gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Navigation du client">
          {tabs.map((tab) => {
            const href = tab.path ? `${base}/${tab.path}` : base;
            const active = current === tab.key;
            return (
              <Link key={tab.key} href={href} className={cn("relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition sm:text-[13px]", active ? "bg-blue-500/12 text-blue-200" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")}>
                <tab.icon className={cn("h-4 w-4", active ? "text-blue-400" : "text-slate-600")} />
                {tab.label}
                {active ? <span className="absolute inset-x-3 -bottom-2 h-0.5 rounded-full bg-blue-400" /> : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

function Action({ href, icon: Icon, label, onClick }: { href: string; icon: typeof FileText; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white">
      <Icon className="h-4 w-4 text-slate-500" />
      <span>{label}</span>
    </Link>
  );
}
