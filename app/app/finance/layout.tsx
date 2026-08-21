import Link from "next/link";
import { BarChart3, BookOpen, BrainCircuit, CreditCard, Gauge, Landmark, ReceiptText, Send, Undo2, WalletCards, CircleDollarSign } from "lucide-react";

const links = [
  { href: "/app/finance", label: "Control Center", icon: Gauge },
  { href: "/app/finance/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/app/finance/accounting", label: "Accounting", icon: BookOpen },
  { href: "/app/finance/payments", label: "Payments", icon: CreditCard },
  { href: "/app/finance/expenses", label: "Expenses", icon: CircleDollarSign },
  { href: "/app/finance/online-payments", label: "Online Payments", icon: WalletCards },
  { href: "/app/finance/accounts", label: "Accounts", icon: Landmark },
  { href: "/app/finance/manual-transfers", label: "Manual Transfers", icon: Send },
  { href: "/app/finance/refunds", label: "Refunds", icon: Undo2 },
  { href: "/app/finance/receipts", label: "Receipts", icon: ReceiptText },
  { href: "/app/finance/reports", label: "Reports", icon: BarChart3 },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <div data-finance-release="phase10-accounting-ledger-2026-08-21">
    <div className="mb-4 flex flex-wrap justify-end gap-2">
      {links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium text-ink hover:bg-surface"><Icon className="h-4 w-4" />{label}</Link>)}
    </div>
    {children}
  </div>;
}
