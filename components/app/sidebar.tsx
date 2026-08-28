"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Mail, MessageCircle, Bell, Users, FolderKanban, CheckSquare, HardDrive,
  FileText, PenTool, Lock, CreditCard, ReceiptText, Undo2, BarChart3,
  Sparkles, UsersRound, Building2, ScrollText, Settings, X, Landmark,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: any; superAdminOnly?: boolean; sectionRoot?: boolean };
const sections: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [{ href: "/app", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Communication",
    items: [
      { href: "/app/mail", label: "Mail", icon: Mail },
      { href: "/app/whatsapp/inbox", label: "WhatsApp Inbox", icon: MessageCircle },
      { href: "/app/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/app/clients", label: "Clients", icon: Users },
      { href: "/app/cases", label: "Cases", icon: FolderKanban },
      { href: "/app/tasks", label: "Tasks", icon: CheckSquare },
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
      { href: "/app/finance/payments", label: "Payments", icon: CreditCard },
      { href: "/app/finance/receipts", label: "Receipts", icon: ReceiptText },
      { href: "/app/finance/refunds", label: "Refunds", icon: Undo2 },
      { href: "/app/finance/reports", label: "Reports", icon: BarChart3 },
      { href: "/app/company-funds", label: "Fonds de l’entreprise", icon: Landmark, superAdminOnly: true, sectionRoot: true },
    ],
  },
  { label: "AI", items: [{ href: "/app/ai", label: "JUN AI", icon: Sparkles }] },
  {
    label: "Company",
    items: [
      { href: "/app/team", label: "Team", icon: UsersRound },
      { href: "/app/departments", label: "Departments", icon: Building2 },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/app/audit", label: "Audit Logs", icon: ScrollText },
      { href: "/app/settings", label: "Settings", icon: Settings },
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
      {open ? <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} /> : null}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-night text-white transition-transform lg:static lg:translate-x-0",open ? "translate-x-0" : "-translate-x-full") }>
        <div className="flex h-16 items-center justify-between px-5"><Link href="/app" className="font-display text-2xl">JUN</Link><button className="lg:hidden" onClick={onClose} aria-label="Close menu"><X className="h-5 w-5" /></button></div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {sections.map((s, i) => {
            const items = s.items.filter(item => !item.superAdminOnly || role === "SUPER_ADMIN");
            if (!items.length) return null;
            return <div key={i} className="mt-4 first:mt-0">
              {s.label ? <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-white/35">{s.label}</p> : null}
              {items.map((item) => {
                const isCompanyFundsRoot=item.href==="/app/company-funds";
                const active = item.href === "/app"
                  ? pathname === "/app"
                  : item.sectionRoot
                    ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const effectiveHref=isCompanyFundsRoot&&!insideCompanyFunds?lastCompanyFundsHref:item.href;
                return <Link key={item.href} href={effectiveHref} onClick={onClose} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white")}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {isCompanyFundsRoot&&!insideCompanyFunds&&lastCompanyFundsHref!=="/app/company-funds"?<span className="mt-0.5 block truncate text-[10px] text-white/35">Reprendre : {companyFundsLabels[lastCompanyFundsHref]||"dernière section"}</span>:null}
                  </span>
                </Link>;
              })}
            </div>;
          })}
        </nav>
      </aside>
    </>
  );
}
