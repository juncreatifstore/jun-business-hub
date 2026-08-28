"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

type Section={id:string;label:string};

function slugify(value:string){
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"");
}

export function CompanyFundsOverviewNavigator(){
  const pathname=usePathname();
  const [sections,setSections]=useState<Section[]>([]);
  const [activeId,setActiveId]=useState<string>("");
  const [open,setOpen]=useState(false);
  const isOverview=pathname==="/app/company-funds";

  useEffect(()=>{
    if(!isOverview){setSections([]);return;}

    const timer=window.setTimeout(()=>{
      const root=document.querySelector("main")??document.body;
      const headings=Array.from(root.querySelectorAll<HTMLHeadingElement>("h3"))
        .filter(node=>node.textContent?.trim());

      const used=new Map<string,number>();
      const next:Section[]=[];
      for(const heading of headings){
        const label=heading.textContent?.trim()||"Section";
        const base=`fonds-${slugify(label)||"section"}`;
        const count=(used.get(base)||0)+1;
        used.set(base,count);
        const id=count===1?base:`${base}-${count}`;
        heading.id=id;
        heading.classList.add("scroll-mt-44");
        next.push({id,label});
      }
      setSections(next);
      setActiveId(next[0]?.id||"");
    },0);

    return()=>window.clearTimeout(timer);
  },[isOverview]);

  useEffect(()=>{
    if(!isOverview||!sections.length)return;
    const nodes=sections.map(section=>document.getElementById(section.id)).filter(Boolean) as HTMLElement[];
    if(!nodes.length)return;

    const observer=new IntersectionObserver(entries=>{
      const visible=entries
        .filter(entry=>entry.isIntersecting)
        .sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
      if(visible[0])setActiveId(visible[0].target.id);
    },{rootMargin:"-170px 0px -65% 0px",threshold:[0,1]});

    nodes.forEach(node=>observer.observe(node));
    return()=>observer.disconnect();
  },[isOverview,sections]);

  const activeLabel=useMemo(()=>sections.find(section=>section.id===activeId)?.label||"Sur cette page",[activeId,sections]);

  function go(id:string){
    const target=document.getElementById(id);
    if(!target)return;
    setActiveId(id);
    setOpen(false);
    target.scrollIntoView({behavior:"smooth",block:"start"});
    history.replaceState(null,"",`#${id}`);
  }

  if(!isOverview||sections.length<2)return null;

  return <div className="sticky top-[116px] z-20 -mt-2 rounded-xl border border-line bg-white/95 shadow-sm backdrop-blur md:top-[126px]">
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted2"><ListTree className="h-4 w-4"/></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted2">Sur cette page</div>
        <div className="truncate text-sm font-semibold text-ink">{activeLabel}</div>
      </div>
      <button type="button" onClick={()=>setOpen(value=>!value)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-muted2 transition hover:bg-surface hover:text-ink" aria-expanded={open}>
        {sections.length} sections <ChevronDown className={cn("h-3.5 w-3.5 transition-transform",open&&"rotate-180")}/>
      </button>
    </div>

    <div className="hidden overflow-x-auto border-t border-line px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:block">
      <div className="flex min-w-max items-center gap-1">
        {sections.map(section=><button key={section.id} type="button" onClick={()=>go(section.id)} className={cn("rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",activeId===section.id?"bg-ink text-white":"text-muted2 hover:bg-surface hover:text-ink")}>{section.label}</button>)}
      </div>
    </div>

    {open?<div className="border-t border-line p-2 md:hidden"><div className="max-h-[42vh] overflow-y-auto rounded-lg bg-surface/50 p-1">{sections.map((section,index)=><button key={section.id} type="button" onClick={()=>go(section.id)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",activeId===section.id?"bg-ink text-white":"text-ink hover:bg-white")}><span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold",activeId===section.id?"bg-white/15":"bg-white text-muted2")}>{index+1}</span><span className="truncate">{section.label}</span></button>)}</div></div>:null}
  </div>;
}
