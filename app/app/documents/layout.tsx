import Link from "next/link";
import { FileText, Plus, Layers3, Files } from "lucide-react";

const items = [
  { href: "/app/documents", label: "Documents", icon: FileText },
  { href: "/app/documents/new", label: "New", icon: Plus },
  { href: "/app/documents/templates", label: "Templates", icon: Layers3 },
  { href: "/app/documents/combine", label: "Combine", icon: Files },
] as const;

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-muted2 transition hover:border-electric/40 hover:text-electric">
            <item.icon className="h-4 w-4" />{item.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
