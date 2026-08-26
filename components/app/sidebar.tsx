"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Mail, MessageCircle, Bell, Users, FolderKanban, CheckSquare, HardDrive,
  FileText, PenTool, Lock, CreditCard, ReceiptText, Undo2, BarChart3,
  Sparkles, UsersRound, Building2, ScrollText, Settings, X,
} from "lucide-react";

const sections: { label: string | null; items: { href: string; label: string; icon: any }[] }[] = [
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

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {open ? <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-night text-white transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/app" className="font-display text-2xl">JUN</Link>
          <button className="lg:hidden" onClick={onClose} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {sections.map((s, i) => (
            <div key={i} className="mt-4 first:mt-0">
              {s.label ? (
                <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-white/35">{s.label}</p>
              ) : null}
              {s.items.map((item) => {
                const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
                      active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
