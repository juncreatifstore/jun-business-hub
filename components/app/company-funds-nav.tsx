"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
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
  Search,
  SearchCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WorkQueue={
  total:number;
  authorizations:number;
  transfers:number;
  reconciliation:number;
  evidence:number;
  reserves:number;
};

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

function itemCount(href:string,queue:WorkQueue){
  if(href.endsWith("/reconciliation")) return queue.reconciliation;
  if(href.endsWith("/transfers")) return queue.transfers;
  if(href.endsWith("/reserves")) return queue.reserves;
  if(href.endsWith("/authorizations")) return queue.authorizations;
  if(href.endsWith("/execution-evidence")) return queue.evidence;
  return 0;
}

export function CompanyFundsNav({workQueue}:{workQueue:WorkQueue}){
  const pathname=usePathname();
  const router=useRouter();
  const [paletteOpen,setPaletteOpen]=useState(false);
  const [query,setQuery]=useState("");
  const currentIndex=Math.max(0,items.findIndex(item=>isActive(pathname,item.href)));
  const current=items[currentIndex]||items[0];
  const previous=currentIndex>0?items[currentIndex-1]:null;
  const next=currentIndex<items.length-1?items[currentIndex+1]:null;

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        setPaletteOpen(open=>!open);
      }
      if(event.key==="Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown",onKeyDown);
    return()=>window.removeEventListener("keydown",onKeyDown);
  },[]);

  useEffect(()=>{setPaletteOpen(false);setQuery("")},[pathname]);

  const filteredItems=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return items;
    return items.filter(item=>`${item.group} ${item.label} ${item.short}`.toLowerCase().includes(q));
  },[query]);

  const quickItems=[
    {href:"/app/company-funds/authorizations",label:"Autorisations",count:workQueue.authorizations},
    {href:"/app/company-funds/reconciliation",label:"À rapprocher",count:workQueue.reconciliation},
    {href:"/app/company-funds/transfers",label:"En transit",count:workQueue.transfers},
    {href:"/app/company-funds/execution-evidence",label:"Preuves manquantes",count:workQueue.evidence},
    {href:"/app/company-funds/reserves",label:"Alertes réserves",count:workQueue.reserves},
  ].filter(item=>item.count>0);

  return (
    <>
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

              <button
                type="button"
                onClick={()=>setPaletteOpen(true)}
                className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium text-muted2 transition hover:border-ink/20 hover:bg-surface hover:text-ink sm:inline-flex"
                title="Recherche rapide — Cmd/Ctrl + K"
              >
                <Search className="h-3.5 w-3.5"/>
                <span>Aller à…</span>
                <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px]">⌘K</kbd>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:max-w-[68%]">
            <nav aria-label="Navigation rapide Fonds de l’entreprise" className="flex min-w-max items-center gap-1 rounded-xl border border-line bg-surface/60 p-1">
              {items.map(item=>{
                const active=isActive(pathname,item.href);const Icon=item.icon;const count=itemCount(item.href,workQueue);
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
                    {count>0?<span className={cn("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold",active?"bg-white text-ink":"bg-red-100 text-red-700")}>{count>99?"99+":count}</span>:null}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted2">
          <span>{currentIndex+1} / {items.length}</span>
          <div className="flex items-center gap-3">
            {previous?<span className="hidden sm:inline">← {previous.short}</span>:null}
            {next?<span>{next.short} →</span>:null}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto border-t border-line pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className={cn("inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-semibold",workQueue.total>0?"bg-amber-50 text-amber-900":"bg-emerald-50 text-emerald-800")}>
            <AlertTriangle className="h-3.5 w-3.5"/>
            {workQueue.total>0?`${workQueue.total} à traiter`:"Tout est à jour"}
          </div>
          {quickItems.map(item=><Link key={item.href} href={item.href} className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink transition hover:border-ink/25 hover:bg-surface"><span>{item.label}</span><span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">{item.count}</span></Link>)}
        </div>
      </div>

      {paletteOpen?<div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={()=>setPaletteOpen(false)}>
        <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-2xl" onMouseDown={event=>event.stopPropagation()}>
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <Search className="h-5 w-5 text-muted2"/>
            <input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Rechercher une option Finance…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted2"/>
            <button type="button" onClick={()=>setPaletteOpen(false)} className="rounded-lg p-1.5 text-muted2 hover:bg-surface hover:text-ink" aria-label="Fermer"><X className="h-4 w-4"/></button>
          </div>
          <div className="max-h-[55vh] overflow-y-auto p-2">
            {filteredItems.map(item=>{const Icon=item.icon;const count=itemCount(item.href,workQueue);return <button key={item.href} type="button" onClick={()=>router.push(item.href)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-surface"><span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs text-muted2">{item.group}</span><span className="block truncate text-sm font-semibold text-ink">{item.label}</span></span>{count>0?<span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">{count}</span>:null}</button>})}
            {!filteredItems.length?<div className="px-4 py-8 text-center text-sm text-muted2">Aucune option trouvée.</div>:null}
          </div>
          <div className="flex items-center justify-between border-t border-line bg-surface/50 px-4 py-2 text-[10px] text-muted2"><span>Entrée rapide : Cmd/Ctrl + K</span><span>Échap pour fermer</span></div>
        </div>
      </div>:null}
    </>
  );
}
