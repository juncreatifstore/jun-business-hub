"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  CircleDollarSign,
  CreditCard,
  FileText,
  Gauge,
  History,
  Landmark,
  ReceiptText,
  Scale,
  Send,
  Target,
  Undo2,
  WalletCards,
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
  const secondaryActive = secondary.some(({ href }) => isActive(pathname, href));

  return (
    <div className="relative z-30 mb-4 rounded-2xl border border-line bg-ink/95 p-2 shadow-sm backdrop-blur sm:mb-5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1 sm:gap-2">
            {primary.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-xs ${active ? "bg-electric text-white shadow-sm" : "text-muted2 hover:bg-surface hover:text-ink"}`}
                >
                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <details className="group relative shrink-0">
          <summary
            className={`inline-flex cursor-pointer list-none items-center rounded-xl px-2.5 py-2 text-[11px] font-semibold sm:px-3 sm:text-xs ${secondaryActive ? "bg-electric/[0.08] text-electric" : "text-muted2 hover:bg-surface hover:text-ink"}`}
          >
            Plus
          </summary>
          <div className="absolute right-0 z-50 mt-2 grid w-[min(300px,calc(100vw-2rem))] grid-cols-1 gap-1 rounded-2xl border border-line bg-white p-2 shadow-xl sm:w-[320px] sm:grid-cols-2">
            {secondary.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium ${active ? "bg-electric/[0.08] text-electric" : "text-ink hover:bg-surface"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </details>

        <div className="hidden shrink-0 sm:block">
          <FinanceWhatsAppAction />
        </div>
      </div>
      <div className="mt-2 sm:hidden">
        <FinanceWhatsAppAction />
      </div>
    </div>
  );
}
