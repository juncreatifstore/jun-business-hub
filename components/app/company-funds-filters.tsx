"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, RotateCcw } from "lucide-react";

const STORAGE_KEY="jun.companyFunds.filters";
type Props={countries:string[];currencies:string[]};
type Saved={country?:string;currency?:string;period?:string};

const periods=[
  {value:"",label:"Toutes périodes"},
  {value:"30",label:"30 derniers jours"},
  {value:"90",label:"90 derniers jours"},
  {value:"365",label:"12 derniers mois"},
] as const;

export function CompanyFundsFilters({countries,currencies}:Props){
  const pathname=usePathname();
  const router=useRouter();
  const searchParams=useSearchParams();
  const [hydrated,setHydrated]=useState(false);

  const country=searchParams.get("country")||"";
  const currency=searchParams.get("currency")||"";
  const period=searchParams.get("period")||"";
  const activeCount=[country,currency,period].filter(Boolean).length;

  const allowedCountries=useMemo(()=>new Set(countries),[countries]);
  const allowedCurrencies=useMemo(()=>new Set(currencies),[currencies]);

  function replaceFilters(next:Saved){
    const params=new URLSearchParams(searchParams.toString());
    const values={country:next.country??country,currency:next.currency??currency,period:next.period??period};
    for(const [key,value] of Object.entries(values)){
      if(value)params.set(key,value); else params.delete(key);
    }
    const query=params.toString();
    router.replace(query?`${pathname}?${query}`:pathname,{scroll:false});
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(values))}catch{}
  }

  useEffect(()=>{
    if(hydrated)return;
    setHydrated(true);
    if(country||currency||period)return;
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}") as Saved;
      const validCountry=saved.country&&allowedCountries.has(saved.country)?saved.country:"";
      const validCurrency=saved.currency&&allowedCurrencies.has(saved.currency)?saved.currency:"";
      const validPeriod=periods.some(item=>item.value===saved.period)?saved.period||"":"";
      if(validCountry||validCurrency||validPeriod)replaceFilters({country:validCountry,currency:validCurrency,period:validPeriod});
    }catch{}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[allowedCountries,allowedCurrencies,hydrated]);

  function reset(){
    const params=new URLSearchParams(searchParams.toString());
    params.delete("country");params.delete("currency");params.delete("period");
    try{localStorage.removeItem(STORAGE_KEY)}catch{}
    const query=params.toString();
    router.replace(query?`${pathname}?${query}`:pathname,{scroll:false});
  }

  return <div className="rounded-xl border border-line bg-white p-3 shadow-sm" aria-label="Filtres globaux Fonds de l’entreprise">
    <div className="flex flex-wrap items-end gap-2">
      <div className="mr-1 flex min-w-[150px] items-center gap-2 self-center text-xs font-semibold text-ink"><Filter className="h-4 w-4"/>Filtres globaux{activeCount>0?<span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] text-white">{activeCount}</span>:null}</div>
      <label className="min-w-[150px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted2">Pays
        <select value={country} onChange={event=>replaceFilters({country:event.target.value})} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-ink outline-none focus:border-electric">
          <option value="">Tous les pays</option>{countries.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="min-w-[135px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted2">Devise
        <select value={currency} onChange={event=>replaceFilters({currency:event.target.value})} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-ink outline-none focus:border-electric">
          <option value="">Toutes les devises</option>{currencies.map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="min-w-[170px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted2">Période
        <select value={period} onChange={event=>replaceFilters({period:event.target.value})} className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2.5 text-xs font-medium normal-case tracking-normal text-ink outline-none focus:border-electric">
          {periods.map(item=><option key={item.value||"all"} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {activeCount>0?<button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-muted2 transition hover:bg-surface hover:text-ink"><RotateCcw className="h-3.5 w-3.5"/>Réinitialiser</button>:null}
    </div>
    <p className="mt-2 text-[10px] text-muted2">Ces filtres restent mémorisés pendant la navigation Finance. Les écrans compatibles appliquent réellement le pays, la devise et la période aux données affichées.</p>
  </div>;
}
