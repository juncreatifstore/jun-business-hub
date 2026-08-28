"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarCheck2,
  ChevronDown,
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
  { href: "/app/company-funds", label: "Vue générale", short: "Vue générale", icon: Landmark, group: "Pilotage" },
  { href: "/app/company-funds/executive", label: "Direction financière", short: "Direction", icon: Gauge, group: "Pilotage" },
  { href: "/app/company-funds/consolidation", label: "Consolidation", short: "Consolidation", icon: RefreshCw, group: "Contrôle" },
  { href: "/app/company-funds/reconciliation", label: "Réconciliation", short: "Réconciliation", icon: SearchCheck, group: "Contrôle" },
  { href: "/app/company-funds/monthly-close", label: "Clôture mensuelle", short: "Clôture", icon: CalendarCheck2, group: "Contrôle" },
  { href: "/app/company-funds/transfers", label: "Transferts internes", short: "Transferts", icon: ArrowRightLeft, group: "Opérations" },
  { href: "/app/company-funds/reserves", label: "Réserves financières", short: "Réserves", icon: PiggyBank, group: "Opérations" },
  { href: "/app/company-funds/authorizations", label: "Autorisations financières", short: "Autorisations", icon: Lock, group: "Sécurité" },
  { href: "/app/company-funds/execution-evidence", label: "Preuves d’exécution", short: "Preuves", icon: FileCheck2, group: "Sécurité" },
] as const;

function isActive(pathname:string,href:string){
  if(href==="/app/company-funds") return pathname===href;
  return pathname===href || pathname.startsWith(`${href}/`);
}

export function CompanyFundsNav(){
  const pathname=usePathname();
  const router=useRouter();
  const currentIndex=Math.max(0,items.findIndex(item=>isActive(pathname,item.href)));
  const current=items[currentIndex]||items[0];
  const previous=currentIndex>0?items[currentIndex-1]:null;
  const next=currentIndex<items.length-1?items[currentIndex+1]:null;

  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-line bg-white/95 px-4 py-3 shadow-[0_4px_18px_rgba(15,23,42,0.04)] backdrop-blur md:-mx-6 md:px-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-muted2">
            <Link href="/app/company-funds" className="font-medium hover:text-ink">Fonds de l’entreprise</Link>
            <span>/</span>
            <span>{current.group}</span>
            <span>/</span>
            <span className="truncate font-semibold text-ink">{current.label}</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!previous}
              onClick={()=>previous&&router.push(previous.href)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-muted2 transition hover:border-ink/20 hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Section précédente"
              title={previous?`Précédent : ${previous.label}`:"Aucune section précédente"}
            >
              <ArrowLeft className="h-4 w-4"/>
            </button>

            <div className="relative min-w-0 flex-1 sm:max-w-[340px]">
              <select
                aria-label="Aller à une section des fonds de l’entreprise"
                value={current.href}
                onChange={event=>router.push(event.target.value)}
                className="h-9 w-full appearance-none rounded-lg border border-line bg-white px-3 pr-9 text-sm font-semibold text-ink outline-none transition focus:border-electric"
              >
                {items.map(item=><option key={item.href} value={item.href}>{item.group} — {item.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2"/>
            </div>

            <button
              type="button"
              disabled={!next}
              onClick={()=>next&&router.push(next.href)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-muted2 transition hover:border-ink/20 hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Section suivante"
              title={next?`Suivant : ${next.label}`:"Aucune section suivante"}
            >
              <ArrowRight className="h-4 w-4"/>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:max-w-[68%]">
          <nav aria-label="Navigation rapide Fonds de l’entreprise" className="flex min-w-max items-center gap-1 rounded-xl border border-line bg-surface/60 p-1">
            {items.map(item=>{
              const active=isActive(pathname,item.href);const Icon=item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active?"page":undefined}
                  title={item.label}
                  className={cn(
                    "group inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition",
                    active
                      ? "bg-ink text-white shadow-sm"
                      : "text-muted2 hover:bg-white hover:text-ink hover:shadow-sm"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0"/>
                  <span>{item.short}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted2">
        <span>{currentIndex+1} / {items.length}</span>
        <div className="flex items-center gap-3">
          {previous?<span className="hidden sm:inline">← {previous.short}</span>:null}
          {next?<span>{next.short} →</span>:null}
        </div>
      </div>
    </div>
  );
}
