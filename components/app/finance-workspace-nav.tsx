"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BookOpen, BrainCircuit, CircleDollarSign, CreditCard, FileText, Gauge,
  History, Landmark, ReceiptText, Scale, Send, Target, Undo2, WalletCards,
} from "lucide-react";
import { FinanceWhatsAppAction } from "@/components/app/finance-whatsapp-action";

const primary = [
  { href: "/app/finance", label: "Vue d’ensemble", icon: Gauge },
  { href: "/app/finance/payments", label: "Paiements", icon: CreditCard },
  { href: "/app/finance/refunds", label: "Remboursements", icon: Undo2 },
  { href: "/app/finance/expenses", label: "Dépenses", icon: CircleDollarSign },
  { href: "/app/finance/invoices", label: "Factures", icon: FileText },
  { href: "/app/finance/accounts", label: "Comptes", icon: Landmark },
];

const secondary = [
  { href: "/app/finance/accounting", label: "Comptabilité", icon: BookOpen },
  { href: "/app/finance/reconciliation", label: "Rapprochement", icon: Scale },
  { href: "/app/finance/budgeting", label: "Budgets", icon: Target },
  { href: "/app/finance/online-payments", label: "Paiements en ligne", icon: WalletCards },
  { href: "/app/finance/manual-transfers", label: "Transferts", icon: Send },
  { href: "/app/finance/receipts", label: "Reçus", icon: ReceiptText },
  { href: "/app/finance/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/app/finance/reports", label: "Rapports", icon: BarChart3 },
  { href: "/app/finance/historical-backfill", label: "Historique", icon: History },
];

function isActive(pathname: string, href: string) {
  if (href === "/app/finance") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FinanceWorkspaceNav() {
  const pathname = usePathname();
  return <div className="mb-5 rounded-2xl border border-line bg-white/95 p-2 shadow-sm backdrop-blur">
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {primary.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return <Link key={href} href={href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? "bg-electric text-white shadow-sm" : "text-muted2 hover:bg-surface hover:text-ink"}`}>
          <Icon className="h-4 w-4" />{label}
        </Link>;
      })}
      <details className="group relative shrink-0">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-muted2 hover:bg-surface hover:text-ink">Plus</summary>
        <div className="absolute right-0 z-40 mt-2 grid w-[270px] grid-cols-1 gap-1 rounded-2xl border border-line bg-white p-2 shadow-xl sm:w-[320px] sm:grid-cols-2">
          {secondary.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return <Link key={href} href={href} className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium ${active ? "bg-electric/[0.08] text-electric" : "text-ink hover:bg-surface"}`}><Icon className="h-4 w-4" />{label}</Link>;
          })}
        </div>
      </details>
      <div className="ml-auto shrink-0 pl-2"><FinanceWhatsAppAction /></div>
    </div>
  </div>;
}
