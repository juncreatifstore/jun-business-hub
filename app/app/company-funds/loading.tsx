function Pulse({className}:{className:string}){
  return <div className={`animate-pulse rounded-lg bg-surface ${className}`} />;
}

export default function CompanyFundsLoading(){
  return (
    <div className="space-y-5" aria-label="Chargement de la section Fonds de l’entreprise" aria-busy="true">
      <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Pulse className="h-3 w-40" />
            <Pulse className="h-8 w-64 max-w-full" />
            <Pulse className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Pulse className="h-9 w-28" />
            <Pulse className="h-9 w-28" />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0,1,2,3].map(item=><div key={item} className="rounded-2xl border border-line bg-white p-4"><Pulse className="mb-3 h-3 w-24"/><Pulse className="h-8 w-32"/><Pulse className="mt-3 h-3 w-20"/></div>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-5 flex items-center justify-between"><Pulse className="h-5 w-40"/><Pulse className="h-8 w-24"/></div>
          <div className="space-y-3">{[0,1,2,3,4].map(item=><div key={item} className="flex items-center gap-3 rounded-xl border border-line p-3"><Pulse className="h-9 w-9 shrink-0"/><div className="min-w-0 flex-1 space-y-2"><Pulse className="h-3 w-2/3"/><Pulse className="h-3 w-1/3"/></div><Pulse className="h-6 w-16"/></div>)}</div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <Pulse className="mb-5 h-5 w-36"/>
          <div className="space-y-4">{[0,1,2,3].map(item=><div key={item}><Pulse className="h-3 w-24"/><Pulse className="mt-2 h-7 w-36"/></div>)}</div>
        </div>
      </div>

      <p className="text-center text-xs text-muted2">Chargement des données financières…</p>
    </div>
  );
}
