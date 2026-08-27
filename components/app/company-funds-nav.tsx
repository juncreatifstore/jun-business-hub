"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarCheck2,
  FileCheck2,
  Gauge,
  Landmark,
  Lock,
  PiggyBank,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/app/company-funds", label: "Vue générale", short: "Vue générale", icon: Landmark },
  { href: "/app/company-funds/consolidation", label: "Consolidation", short: "Consolidation", icon: RefreshCw },
  { href: "/app/company-funds/reconciliation", label: "Réconciliation", short: "Réconciliation", icon: SearchCheck },
  { href: "/app/company-funds/transfers", label: "Transferts", short: "Transferts", icon: ArrowRightLeft },
  { href: "/app/company-funds/reserves", label: "Réserves", short: "Réserves", icon: PiggyBank },
  { href: "/app/company-funds/authorizations", label: "Autorisations", short: "Autorisations", icon: Lock },
  { href: "/app/company-funds/execution-evidence", label: "Preuves d’exécution", short: "Preuves", icon: FileCheck2 },
  { href: "/app/company-funds/monthly-close", label: "Clôture mensuelle", short: "Clôture", icon: CalendarCheck2 },
  { href: "/app/company-funds/executive", label: "Direction financière", short: "Direction", icon: Gauge },
] as const;

function isActive(pathname:string,href:string){
  if(href==="/app/company-funds") return pathname===href;
  return pathname===href || pathname.startsWith(`${href}/`);
}

export function CompanyFundsNav(){
  const pathname=usePathname();
  const current=items.find(item=>isActive(pathname,item.href))||items[0];
  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-line bg-white/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-6 md:px-6">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted2">
        <Link href="/app/company-funds" className="font-medium hover:text-ink">Fonds de l’entreprise</Link>
        <span>/</span>
        <span className="text-ink">{current.label}</span>
      </div>
      <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav aria-label="Navigation Fonds de l’entreprise" className="flex min-w-max gap-2">
          {items.map(item=>{
            const active=isActive(pathname,item.href);const Icon=item.icon;
            return <Link key={item.href} href={item.href} aria-current={active?"page":undefined} className={cn("inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition",active?"border-ink bg-ink text-white shadow-sm":"border-line bg-white text-muted2 hover:border-ink/30 hover:bg-surface hover:text-ink")}><Icon className="h-3.5 w-3.5"/><span className="hidden sm:inline">{item.label}</span><span className="sm:hidden">{item.short}</span></Link>;
          })}
        </nav>
      </div>
    </div>
  );
}
