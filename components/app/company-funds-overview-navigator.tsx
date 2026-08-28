"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, ListTree, PanelTopClose, PanelTopOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type Section={id:string;label:string};
const COLLAPSED_KEY="jun.companyFunds.overview.collapsed";

function slugify(value:string){
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"");
}

function getSectionCard(id:string){
  const heading=document.getElementById(id);
  const header=heading?.parentElement;
  const card=header?.parentElement;
  return card instanceof HTMLElement?card:null;
}

export function CompanyFundsOverviewNavigator(){
  const pathname=usePathname();
  const [sections,setSections]=useState<Section[]>([]);
  const [activeId,setActiveId]=useState<string>("");
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState<string[]>([]);
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
      try{
        const saved=JSON.parse(localStorage.getItem(COLLAPSED_KEY)||"[]");
        if(Array.isArray(saved))setCollapsed(saved.filter((id):id is string=>typeof id==="string"&&next.some(section=>section.id===id)));
      }catch{setCollapsed([])}
    },0);

    return()=>window.clearTimeout(timer);
  },[isOverview]);

  useEffect(()=>{
    if(!isOverview||!sections.length)return;
    const collapsedSet=new Set(collapsed);
    for(const section of sections){
      const card=getSectionCard(section.id);
      if(!card)continue;
      const children=Array.from(card.children) as HTMLElement[];
      children.slice(1).forEach(child=>{child.style.display=collapsedSet.has(section.id)?"none":""});
      card.dataset.companyFundsCollapsed=collapsedSet.has(section.id)?"true":"false";
    }
    try{localStorage.setItem(COLLAPSED_KEY,JSON.stringify(collapsed))}catch{}
  },[collapsed,isOverview,sections]);

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
  const activeCollapsed=collapsed.includes(activeId);

  function setOneCollapsed(id:string,value:boolean){
    setCollapsed(previous=>value
      ? previous.includes(id)?previous:[...previous,id]
      : previous.filter(item=>item!==id)
    );
  }

  function go(id:string){
    const target=document.getElementById(id);
    if(!target)return;
    setActiveId(id);
    setOpen(false);
    if(collapsed.includes(id))setOneCollapsed(id,false);
    window.setTimeout(()=>{
      target.scrollIntoView({behavior:"smooth",block:"start"});
      history.replaceState(null,"",`#${id}`);
    },0);
  }

  function collapseAll(){setCollapsed(sections.map(section=>section.id))}
  function expandAll(){setCollapsed([])}

  if(!isOverview||sections.length<2)return null;

  return <div className="sticky top-[116px] z-20 -mt-2 rounded-xl border border-line bg-white/95 shadow-sm backdrop-blur md:top-[126px]">
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted2"><ListTree className="h-4 w-4"/></div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted2">Sur cette page</div>
        <div className="truncate text-sm font-semibold text-ink">{activeLabel}</div>
      </div>

      <button type="button" onClick={()=>setOneCollapsed(activeId,!activeCollapsed)} className="hidden h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-muted2 transition hover:bg-surface hover:text-ink sm:inline-flex" title={activeCollapsed?"Développer cette section":"Réduire cette section"}>
        {activeCollapsed?<PanelTopOpen className="h-3.5 w-3.5"/>:<PanelTopClose className="h-3.5 w-3.5"/>}
        {activeCollapsed?"Développer":"Réduire"}
      </button>

      <button type="button" onClick={()=>setOpen(value=>!value)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-muted2 transition hover:bg-surface hover:text-ink" aria-expanded={open}>
        {sections.length} sections <ChevronDown className={cn("h-3.5 w-3.5 transition-transform",open&&"rotate-180")}/>
      </button>
    </div>

    <div className="hidden overflow-x-auto border-t border-line px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:block">
      <div className="flex min-w-max items-center gap-1">
        {sections.map(section=>{
          const isCollapsed=collapsed.includes(section.id);
          return <div key={section.id} className={cn("inline-flex items-center rounded-lg transition",activeId===section.id?"bg-ink text-white":"text-muted2 hover:bg-surface hover:text-ink")}>
            <button type="button" onClick={()=>go(section.id)} className="px-2.5 py-1.5 text-[11px] font-medium">{section.label}</button>
            <button type="button" onClick={()=>setOneCollapsed(section.id,!isCollapsed)} className={cn("mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md",activeId===section.id?"hover:bg-white/15":"hover:bg-white")} aria-label={isCollapsed?`Développer ${section.label}`:`Réduire ${section.label}`} title={isCollapsed?"Développer":"Réduire"}>
              {isCollapsed?<ChevronDown className="h-3 w-3"/>:<ChevronUp className="h-3 w-3"/>}
            </button>
          </div>;
        })}
        <span className="mx-1 h-5 w-px bg-line"/>
        <button type="button" onClick={collapseAll} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted2 hover:bg-surface hover:text-ink"><PanelTopClose className="h-3 w-3"/>Tout réduire</button>
        <button type="button" onClick={expandAll} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-muted2 hover:bg-surface hover:text-ink"><PanelTopOpen className="h-3 w-3"/>Tout développer</button>
      </div>
    </div>

    {open?<div className="border-t border-line p-2 md:hidden">
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={collapseAll} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-xs font-medium text-muted2"><PanelTopClose className="h-3.5 w-3.5"/>Tout réduire</button>
        <button type="button" onClick={expandAll} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-white text-xs font-medium text-muted2"><PanelTopOpen className="h-3.5 w-3.5"/>Tout développer</button>
      </div>
      <div className="max-h-[42vh] overflow-y-auto rounded-lg bg-surface/50 p-1">{sections.map((section,index)=>{
        const isCollapsed=collapsed.includes(section.id);
        return <div key={section.id} className={cn("flex items-center rounded-lg transition",activeId===section.id?"bg-ink text-white":"text-ink hover:bg-white")}>
          <button type="button" onClick={()=>go(section.id)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm"><span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold",activeId===section.id?"bg-white/15":"bg-white text-muted2")}>{index+1}</span><span className="truncate">{section.label}</span></button>
          <button type="button" onClick={()=>setOneCollapsed(section.id,!isCollapsed)} className={cn("mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",activeId===section.id?"hover:bg-white/15":"hover:bg-surface")} aria-label={isCollapsed?`Développer ${section.label}`:`Réduire ${section.label}`}>
            {isCollapsed?<ChevronDown className="h-4 w-4"/>:<ChevronUp className="h-4 w-4"/>}
          </button>
        </div>;
      })}</div>
    </div>:null}
  </div>;
}
