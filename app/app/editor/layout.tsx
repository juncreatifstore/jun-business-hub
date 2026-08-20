import Link from "next/link";
import { FileText, LayoutDashboard, Layers3, PenLine, Send, Inbox, Users, ArrowLeft } from "lucide-react";

const nav = [
  { href: "/app/editor", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/documents", label: "My documents", icon: FileText },
  { href: "/app/documents/templates", label: "Templates", icon: Layers3 },
  { href: "/app/signatures", label: "E-signatures", icon: PenLine },
  { href: "/app/signatures", label: "Sent", icon: Send },
  { href: "/app/drive", label: "Received / Drive", icon: Inbox },
  { href: "/app/clients", label: "Contacts", icon: Users },
];

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f5f6f8]">
      <aside className="hidden w-[286px] shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-100 px-5 py-4">
          <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> JUN Business Hub</Link>
          <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">JUN Editor</div>
          <p className="text-xs text-slate-500">Documents · Forms · E-signatures</p>
        </div>
        <div className="p-3">
          <Link href="/app/documents/new" className="flex h-11 items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-bold text-white shadow-sm hover:bg-orange-600">＋ Add new</Link>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          {nav.map((item) => <Link key={`${item.href}-${item.label}`} href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950"><item.icon className="h-4 w-4" />{item.label}</Link>)}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
