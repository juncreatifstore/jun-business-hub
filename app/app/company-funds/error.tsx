"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function CompanyFundsError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{
    console.error("Company Funds route error",error);
  },[error]);

  return <div className="mx-auto flex min-h-[52vh] max-w-2xl items-center justify-center px-2 py-10">
    <div className="w-full rounded-2xl border border-red-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-start gap-4">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
          <AlertTriangle className="h-5 w-5"/>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-700">Fonds de l’entreprise</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Cette section n’a pas pu être chargée</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted2">Vos données ne sont pas modifiées par cet écran. Vous pouvez réessayer immédiatement ou revenir à la Vue générale du module financier.</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white transition hover:opacity-90">
              <RefreshCw className="h-4 w-4"/>Réessayer
            </button>
            <Link href="/app/company-funds" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink transition hover:bg-surface">
              <ArrowLeft className="h-4 w-4"/>Vue générale
            </Link>
          </div>

          {error.digest?<div className="mt-5 rounded-lg bg-surface px-3 py-2 text-[11px] text-muted2">Référence technique : <span className="font-mono">{error.digest}</span></div>:null}
        </div>
      </div>
    </div>
  </div>;
}
