import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTreasuryStore } from "@/lib/company-funds";
import { listFinancialAuthorizations } from "@/lib/company-funds-approvals";
import { listFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
import { listTreasuryTransfers } from "@/lib/company-funds-transfers";
import { formatMoney } from "@/lib/utils";
import { Activity, ArrowRight, CheckCircle2, FileCheck2, Landmark, Lock, RefreshCw, SearchCheck } from "lucide-react";

export const dynamic="force-dynamic";

type TimelineEvent={
  id:string;
  at:string;
  kind:"AUTHORIZATION"|"APPROVAL"|"EVIDENCE"|"TRANSFER"|"PROJECT"|"RECONCILIATION";
  title:string;
  detail:string;
  reference:string;
  amount?:number;
  currency?:string;
  status?:string;
  href:string;
};

function validDate(value:string|null|undefined){
  if(!value)return null;
  const time=new Date(value).getTime();
  return Number.isFinite(time)?new Date(time).toISOString():null;
}

function statusTone(status:string|undefined){
  if(!status)return "bg-surface text-muted2";
  if(["APPROVED","COMPLETED","MATCHED","RESOLVED"].includes(status))return "bg-emerald-50 text-emerald-700";
  if(["REJECTED","CANCELLED"].includes(status))return "bg-red-50 text-red-700";
  if(["PENDING","IN_TRANSIT","REVIEW"].includes(status))return "bg-amber-50 text-amber-800";
  return "bg-surface text-muted2";
}

function iconFor(kind:TimelineEvent["kind"]){
  if(kind==="AUTHORIZATION"||kind==="APPROVAL")return Lock;
  if(kind==="EVIDENCE")return FileCheck2;
  if(kind==="TRANSFER")return RefreshCw;
  if(kind==="PROJECT")return Activity;
  return SearchCheck;
}

export default async function CompanyFundsTimelinePage({searchParams}:{searchParams?:{q?:string;kind?:string}}){
  const user=await requireUser();
  if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");

  const [authorizations,evidence,transfers,store]=await Promise.all([
    listFinancialAuthorizations(3000),
    listFinancialExecutionEvidence(3000),
    listTreasuryTransfers(),
    getTreasuryStore(),
  ]);

  const accountMap=new Map(store.accounts.map(account=>[account.id,account]));
  const integrationMap=new Map(store.integrations.map(integration=>[integration.id,integration]));
  const events:TimelineEvent[]=[];

  for(const authorization of authorizations){
    events.push({
      id:`authorization-${authorization.id}`,
      at:authorization.createdAt,
      kind:"AUTHORIZATION",
      title:`Autorisation ${authorization.type.toLowerCase()}`,
      detail:authorization.description||authorization.reason,
      reference:authorization.reference||authorization.id,
      amount:authorization.amount,
      currency:authorization.currency,
      status:authorization.status,
      href:"/app/company-funds/authorizations",
    });
    for(const decision of authorization.decisions){
      events.push({
        id:`decision-${authorization.id}-${decision.userId}-${decision.decidedAt}`,
        at:decision.decidedAt,
        kind:"APPROVAL",
        title:decision.decision==="APPROVE"?"Approbation enregistrée":"Rejet enregistré",
        detail:decision.note||`Décision sur ${authorization.description}`,
        reference:authorization.reference||authorization.id,
        amount:authorization.amount,
        currency:authorization.currency,
        status:decision.decision==="APPROVE"?"APPROVED":"REJECTED",
        href:"/app/company-funds/authorizations",
      });
    }
  }

  for(const item of evidence){
    events.push({
      id:`evidence-${item.id}`,
      at:item.executedAt||item.createdAt,
      kind:"EVIDENCE",
      title:`Preuve d’exécution ${item.type.toLowerCase()}`,
      detail:item.transactionReference?`Référence transaction : ${item.transactionReference}`:"Preuve d’exécution enregistrée",
      reference:item.reference||item.id,
      status:"COMPLETED",
      href:"/app/company-funds/execution-evidence",
    });
  }

  for(const transfer of transfers){
    const from=accountMap.get(transfer.fromAccountId);
    const to=accountMap.get(transfer.toAccountId);
    events.push({
      id:`transfer-created-${transfer.id}`,
      at:transfer.createdAt,
      kind:"TRANSFER",
      title:"Transfert interne créé",
      detail:`${from?.name||transfer.fromAccountId} → ${to?.name||transfer.toAccountId}`,
      reference:transfer.reference,
      amount:transfer.sentAmount+transfer.feeAmount,
      currency:transfer.fromCurrency,
      status:"DRAFT",
      href:"/app/company-funds/transfers",
    });
    const initiated=validDate(transfer.initiatedAt);
    if(initiated)events.push({
      id:`transfer-initiated-${transfer.id}`,
      at:initiated,
      kind:"TRANSFER",
      title:"Transfert envoyé",
      detail:`${formatMoney(transfer.sentAmount,transfer.fromCurrency)} vers ${to?.name||"compte destination"}`,
      reference:transfer.reference,
      amount:transfer.sentAmount,
      currency:transfer.fromCurrency,
      status:"IN_TRANSIT",
      href:"/app/company-funds/transfers",
    });
    const completed=validDate(transfer.completedAt);
    if(completed)events.push({
      id:`transfer-completed-${transfer.id}`,
      at:completed,
      kind:"TRANSFER",
      title:"Transfert reçu",
      detail:`Montant reçu : ${formatMoney(transfer.actualReceivedAmount||0,transfer.toCurrency)}`,
      reference:transfer.reference,
      amount:transfer.actualReceivedAmount||0,
      currency:transfer.toCurrency,
      status:"COMPLETED",
      href:"/app/company-funds/transfers",
    });
  }

  for(const flow of store.projectCashflows.slice(0,5000)){
    const integration=integrationMap.get(flow.integrationId);
    events.push({
      id:`project-${flow.id}`,
      at:flow.occurredAt,
      kind:"PROJECT",
      title:flow.direction==="IN"?"Entrée projet synchronisée":"Sortie projet synchronisée",
      detail:`${integration?.name||"Projet"} · ${flow.category}${flow.description?` · ${flow.description}`:""}`,
      reference:flow.externalId,
      amount:flow.amount,
      currency:flow.currency,
      status:flow.direction,
      href:"/app/company-funds/consolidation",
    });
  }

  for(const reconciliation of store.reconciliations.slice(0,3000)){
    const account=accountMap.get(reconciliation.accountId);
    events.push({
      id:`reconciliation-${reconciliation.id}`,
      at:reconciliation.resolvedAt||reconciliation.createdAt,
      kind:"RECONCILIATION",
      title:reconciliation.status==="MATCHED"?"Compte rapproché":reconciliation.status==="RESOLVED"?"Écart résolu":"Écart de solde détecté",
      detail:`${account?.name||"Compte"} · écart ${formatMoney(reconciliation.difference,account?.currency||"USD")}`,
      reference:reconciliation.id,
      amount:Math.abs(reconciliation.difference),
      currency:account?.currency,
      status:reconciliation.status,
      href:"/app/company-funds/reconciliation",
    });
  }

  const q=String(searchParams?.q||"").trim().toLowerCase();
  const kind=String(searchParams?.kind||"").trim().toUpperCase();
  const kinds=new Set<TimelineEvent["kind"]>(["AUTHORIZATION","APPROVAL","EVIDENCE","TRANSFER","PROJECT","RECONCILIATION"]);
  const selectedKind=kinds.has(kind as TimelineEvent["kind"])?kind as TimelineEvent["kind"]:"";
  const filtered=events
    .filter(event=>!selectedKind||event.kind===selectedKind)
    .filter(event=>!q||`${event.title} ${event.detail} ${event.reference} ${event.currency||""} ${event.status||""}`.toLowerCase().includes(q))
    .sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime())
    .slice(0,500);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Super Admin · Traçabilité</p><h1 className="mt-1 text-3xl font-semibold">Timeline des opérations</h1><p className="mt-1 max-w-3xl text-sm text-muted2">Chronologie consolidée des autorisations, approbations, preuves, transferts, flux projets et rapprochements. Chaque événement renvoie vers son module d’origine.</p></div>
      <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="mr-1 inline h-4 w-4"/>LECTURE CONSOLIDÉE</div>
    </div>

    <form className="grid gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
      <label className="text-xs font-medium text-muted2">Recherche<input name="q" defaultValue={searchParams?.q||""} placeholder="Référence, projet, compte, statut…" className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-electric"/></label>
      <label className="text-xs font-medium text-muted2">Type<select name="kind" defaultValue={selectedKind} className="mt-1 h-10 w-full rounded-lg border border-line px-3 text-sm text-ink"><option value="">Tous les événements</option><option value="AUTHORIZATION">Autorisations</option><option value="APPROVAL">Décisions</option><option value="EVIDENCE">Preuves</option><option value="TRANSFER">Transferts</option><option value="PROJECT">Flux projets</option><option value="RECONCILIATION">Rapprochements</option></select></label>
      <div className="flex items-end gap-2"><button className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Filtrer</button>{(q||selectedKind)?<Link href="/app/company-funds/timeline" className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium text-muted2 hover:bg-surface">Réinitialiser</Link>:null}</div>
    </form>

    <div className="rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-semibold text-ink">Événements financiers</h2><p className="mt-0.5 text-xs text-muted2">{filtered.length} événement(s) affiché(s), maximum 500.</p></div><Landmark className="h-5 w-5 text-muted2"/></div>
      {filtered.length?<div className="divide-y divide-line">{filtered.map(event=>{const Icon=iconFor(event.kind);return <div key={event.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[44px_1fr_auto] sm:px-5">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-muted2"><Icon className="h-4 w-4"/></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-ink">{event.title}</span>{event.status?<span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusTone(event.status)}`}>{event.status}</span>:null}</div><p className="mt-1 text-sm text-muted2">{event.detail}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted2"><span>{new Date(event.at).toLocaleString("fr-FR")}</span><span>Réf. {event.reference}</span>{event.amount!=null&&event.currency?<span className="font-semibold text-ink">{formatMoney(event.amount,event.currency)}</span>:null}</div></div>
        <div className="flex items-center sm:justify-end"><Link href={event.href} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-muted2 transition hover:bg-surface hover:text-ink">Ouvrir <ArrowRight className="h-3.5 w-3.5"/></Link></div>
      </div>})}</div>:<div className="px-5 py-12 text-center text-sm text-muted2">Aucun événement ne correspond aux filtres.</div>}
    </div>
  </div>;
}
