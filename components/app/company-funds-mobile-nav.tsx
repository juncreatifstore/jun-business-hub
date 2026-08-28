"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRightLeft,
  CalendarCheck2,
  FileCheck2,
  Gauge,
  Landmark,
  Lock,
  Menu,
  PiggyBank,
  RefreshCw,
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

const items=[
  {href:"/app/company-funds",label:"Vue générale",short:"Accueil",group:"Pilotage",icon:Landmark},
  {href:"/app/company-funds/executive",label:"Direction financière",short:"Direction",group:"Pilotage",icon:Gauge},
  {href:"/app/company-funds/consolidation",label:"Consolidation",short:"Consolidation",group:"Contrôle",icon:RefreshCw},
  {href:"/app/company-funds/reconciliation",label:"Réconciliation",short:"Rapprocher",group:"Contrôle",icon:SearchCheck},
  {href:"/app/company-funds/monthly-close",label:"Clôture mensuelle",short:"Clôture",group:"Contrôle",icon:CalendarCheck2},
  {href:"/app/company-funds/transfers",label:"Transferts internes",short:"Transferts",group:"Opérations",icon:ArrowRightLeft},
  {href:"/app/company-funds/reserves",label:"Réserves financières",short:"Réserves",group:"Opérations",icon:PiggyBank},
  {href:"/app/company-funds/authorizations",label:"Autorisations financières",short:"Autorisations",group:"Sécurité",icon:Lock},
  {href:"/app/company-funds/execution-evidence",label:"Preuves d’exécution",short:"Preuves",group:"Sécurité",icon:FileCheck2},
] as const;

function active(pathname:string,href:string){
  if(href==="/app/company-funds") return pathname===href;
  return pathname===href||pathname.startsWith(`${href}/`);
}

function countFor(href:string,queue:WorkQueue){
  if(href.endsWith("/reconciliation"))return queue.reconciliation;
  if(href.endsWith("/transfers"))return queue.transfers;
  if(href.endsWith("/reserves"))return queue.reserves;
  if(href.endsWith("/authorizations"))return queue.authorizations;
  if(href.endsWith("/execution-evidence"))return queue.evidence;
  return 0;
}

export function CompanyFundsMobileNav({workQueue}:{workQueue:WorkQueue}){
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const primary=[items[0],items[1],items[5],items[7]];

  return <>
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {primary.map(item=>{const Icon=item.icon;const isCurrent=active(pathname,item.href);const count=countFor(item.href,workQueue);return <Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className={cn("relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium transition",isCurrent?"bg-ink text-white":"text-muted2 active:bg-surface")}><Icon className="h-4 w-4"/><span className="max-w-full truncate">{item.short}</span>{count>0?<span className={cn("absolute right-2 top-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold",isCurrent?"bg-white text-ink":"bg-red-100 text-red-700")}>{count>9?"9+":count}</span>:null}</Link>})}
        <button type="button" onClick={()=>setOpen(true)} className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-medium text-muted2 transition active:bg-surface"><Menu className="h-4 w-4"/><span>Plus</span>{workQueue.total>0?<span className="absolute right-2 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[9px] font-bold text-amber-800">{workQueue.total>9?"9+":workQueue.total}</span>:null}</button>
      </div>
    </div>

    {open?<div className="fixed inset-0 z-[90] bg-black/35 md:hidden" onMouseDown={()=>setOpen(false)}>
      <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl" onMouseDown={event=>event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted2">Fonds de l’entreprise</p><h2 className="mt-1 text-lg font-semibold text-ink">Toutes les options</h2></div><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-line p-2 text-muted2"><X className="h-5 w-5"/></button></div>
        <div className="overflow-y-auto px-3 py-3" style={{maxHeight:"calc(82vh - 82px)"}}>
          {(["Pilotage","Contrôle","Opérations","Sécurité"] as const).map(group=>{
            const groupItems=items.filter(item=>item.group===group);
            return <div key={group} className="mb-4"><p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted2">{group}</p><div className="grid grid-cols-1 gap-1.5">{groupItems.map(item=>{const Icon=item.icon;const isCurrent=active(pathname,item.href);const count=countFor(item.href,workQueue);return <Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className={cn("flex items-center gap-3 rounded-2xl border px-3 py-3 transition",isCurrent?"border-ink bg-ink text-white":"border-line bg-white text-ink active:bg-surface")}><span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",isCurrent?"bg-white/10":"bg-surface")}><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.label}</span><span className={cn("mt-0.5 block text-[11px]",isCurrent?"text-white/60":"text-muted2")}>{group}</span></span>{count>0?<span className={cn("inline-flex min-w-7 items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold",isCurrent?"bg-white text-ink":"bg-red-100 text-red-700")}>{count}</span>:null}</Link>})}</div></div>;
          })}
        </div>
      </div>
    </div>:null}
  </>;
}
