"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Mail, MessageCircle, Bell, Users, FolderKanban, CheckSquare, HardDrive,
  FileText, PenTool, Lock, CreditCard, ReceiptText, Undo2, BarChart3,
  Sparkles, UsersRound, Building2, ScrollText, Settings, X, Landmark, BriefcaseBusiness,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: any; superAdminOnly?: boolean; sectionRoot?: boolean };
const sections: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Communication",
    items: [
      { href: "/app/whatsapp/inbox", label: "WhatsApp Inbox", icon: MessageCircle },
      { href: "/app/mail", label: "Mail", icon: Mail },
      { href: "/app/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Gestion",
    items: [
      { href: "/app/clients", label: "Clients", icon: Users },
      { href: "/app/cases", label: "Dossiers", icon: FolderKanban },
      { href: "/app/tasks", label: "Tâches", icon: CheckSquare },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/app/drive", label: "Drive", icon: HardDrive },
      { href: "/app/documents", label: "Documents", icon: FileText },
      { href: "/app/signatures", label: "Signatures", icon: PenTool },
      { href: "/app/vault", label: "Vault", icon: Lock },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/app/finance/payments", label: "Paiements", icon: CreditCard },
      { href: "/app/finance/receipts", label: "Reçus", icon: ReceiptText },
      { href: "/app/finance/refunds", label: "Remboursements", icon: Undo2 },
      { href: "/app/finance/reports", label: "Rapports", icon: BarChart3 },
      { href: "/app/company-funds", label: "Company Funds", icon: Landmark, superAdminOnly: true, sectionRoot: true },
    ],
  },
  { label: "Intelligence", items: [{ href: "/app/ai", label: "JUN AI", icon: Sparkles }] },
  {
    label: "Entreprise",
    items: [
      { href: "/app/team", label: "Équipe", icon: UsersRound },
      { href: "/app/departments", label: "Départements", icon: Building2 },
    ],
  },
  {
    label: "Système",
    items: [
      { href: "/app/audit", label: "Journal d’audit", icon: ScrollText },
      { href: "/app/settings", label: "Paramètres", icon: Settings },
    ],
  },
];

const companyFundsLabels:Record<string,string>={
  "/app/company-funds":"Vue générale",
  "/app/company-funds/executive":"Direction",
  "/app/company-funds/consolidation":"Consolidation",
  "/app/company-funds/reconciliation":"Réconciliation",
  "/app/company-funds/monthly-close":"Clôture",
  "/app/company-funds/transfers":"Transferts",
  "/app/company-funds/reserves":"Réserves",
  "/app/company-funds/authorizations":"Autorisations",
  "/app/company-funds/execution-evidence":"Preuves",
};
const companyFundsAllowed=new Set(Object.keys(companyFundsLabels));
const COMPANY_FUNDS_RECENTS_KEY="jun.companyFunds.recents";

export function Sidebar({ open, onClose, role }: { open: boolean; onClose: () => void; role: string }) {
  const pathname = usePathname();
  const [lastCompanyFundsHref,setLastCompanyFundsHref]=useState("/app/company-funds");

  useEffect(()=>{
    try{
      const stored=JSON.parse(localStorage.getItem(COMPANY_FUNDS_RECENTS_KEY)||"[]");
      if(Array.isArray(stored)){
        const recent=stored.find((href):href is string=>typeof href==="string"&&companyFundsAllowed.has(href));
        if(recent)setLastCompanyFundsHref(recent);
      }
    }catch{}
  },[]);

  useEffect(()=>{
    const matched=Object.keys(companyFundsLabels).find(href=>href==="/app/company-funds"?pathname===href:pathname===href||pathname.startsWith(`${href}/`));
    if(matched&&companyFundsAllowed.has(matched))setLastCompanyFundsHref(matched);
  },[pathname]);

  const insideCompanyFunds=pathname==="/app/company-funds"||pathname.startsWith("/app/company-funds/");

  return (
    <>
      {open ? <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={onClose} /> : null}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-[262px] flex-col border-r border-white/[0.07] bg-[#08101d] text-white shadow-2xl shadow-black/20 transition-transform lg:static lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-[72px] items-center justify-between border-b border-white/[0.06] px-4">
          <Link href="/app" className="group flex min-w-0 items-center gap-3" onClick={onClose}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-lg font-bold shadow-lg shadow-blue-950/40">J</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold tracking-tight text-white">JUN Business Hub</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Business OS</span>
            </span>
          </Link>
          <button className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] hover:text-white lg:hidden" onClick={onClose} aria-label="Fermer le menu"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin] [scrollbar-color:#243044_transparent]">
          {sections.map((s, i) => {
            const items = s.items.filter(item => !item.superAdminOnly || role === "SUPER_ADMIN");
            if (!items.length) return null;
            return <div key={i} className="mt-5 first:mt-0">
              {s.label ? <p className="px-3 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-600">{s.label}</p> : null}
              <div className="space-y-1">
                {items.map((item) => {
                  const isCompanyFundsRoot=item.href==="/app/company-funds";
                  const active = item.href === "/app"
                    ? pathname === "/app"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const effectiveHref=isCompanyFundsRoot&&!insideCompanyFunds?lastCompanyFundsHref:item.href;
                  return <Link
                    key={item.href}
                    href={effectiveHref}
                    onClick={onClose}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all",
                      active
                        ? "bg-blue-500/15 text-blue-100 shadow-[inset_0_0_0_1px_rgba(59,130,246,.12)]"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"
                    )}
                  >
                    {active ? <span className="absolute left-0 h-5 w-0.5 rounded-r bg-blue-400" /> : null}
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition",active?"bg-blue-500/15 text-blue-400":"text-slate-500 group-hover:text-slate-300")}>
                      <item.icon className="h-[17px] w-[17px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      {isCompanyFundsRoot&&!insideCompanyFunds&&lastCompanyFundsHref!=="/app/company-funds"?<span className="mt-0.5 block truncate text-[9px] font-normal text-slate-600">Reprendre · {companyFundsLabels[lastCompanyFundsHref]||"dernière section"}</span>:null}
                    </span>
                  </Link>;
                })}
              </div>
            </div>;
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300"><BriefcaseBusiness className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-slate-200">JUN Créatif & Travel</span>
              <span className="block truncate text-[10px] text-slate-500">Compte principal</span>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
