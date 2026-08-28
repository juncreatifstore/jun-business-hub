import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTreasuryTransactionReconciliation } from "@/lib/company-funds-transaction-reconciliation";
import { companyFundsFilterLabel, parseCompanyFundsFilters } from "@/lib/company-funds-filters";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, SearchCheck, Copy, ReceiptText, Landmark, ShieldAlert, Filter } from "lucide-react";
import { acceptTreasurySuggestedMatchAction, ignoreTreasuryBankTransactionAction } from "@/services/company-funds-transaction-reconciliation";

export const dynamic="force-dynamic";

export default async function TreasuryReconciliationPage({searchParams}:{searchParams?:{country?:string;currency?:string;period?:string}}){
  const user=await requireUser();if(user.role!=="SUPER_ADMIN")redirect("/app/forbidden");
  const raw=await getTreasuryTransactionReconciliation();
  const filters=parseCompanyFundsFilters(searchParams);
  const cutoff=filters.periodDays?Date.now()-filters.periodDays*86400000:null;
  const inPeriod=(value:string)=>!cutoff||new Date(value).getTime()>=cutoff;
  const scopedAccountRows=raw.byAccount.filter(row=>(!filters.country||row.account.country===filters.country)&&(!filters.currency||row.account.currency===filters.currency));
  const scopedAccountIds=new Set(scopedAccountRows.map(row=>row.account.id));
  const scopedImportIds=new Set<string>();
  for(const accountId of scopedAccountIds)for(const importId of raw.accountImportIds.get(accountId)||[])scopedImportIds.add(importId);

  const financeEntries=raw.financeEntries.filter(entry=>{
    if(filters.currency&&entry.currency!==filters.currency)return false;
    if(!inPeriod(entry.occurredAt))return false;
    if(filters.country&&(!entry.treasuryAccountId||!scopedAccountIds.has(entry.treasuryAccountId)))return false;
    return true;
  });
  const bankTransactions=raw.bankTransactions.filter(bank=>{
    if(filters.currency&&bank.currency!==filters.currency)return false;
    if(!inPeriod(bank.date))return false;
    if(filters.country&&!scopedImportIds.has(bank.importId))return false;
    return true;
  });
  const financeIds=new Set(financeEntries.map(entry=>entry.id));
  const bankIds=new Set(bankTransactions.map(bank=>bank.id));
  const matches=raw.matches.filter(match=>financeIds.has(match.financeEntryId)&&bankIds.has(match.bankTransactionId));
  const suggestions=raw.suggestions.filter(item=>financeIds.has(item.finance.id)&&bankIds.has(item.bank.id));
  const unexplainedBank=raw.unexplainedBank.filter(bank=>bankIds.has(bank.id));
  const missingInBank=raw.missingInBank.filter(entry=>financeIds.has(entry.id));
  const unexpectedFees=raw.unexpectedFees.filter(bank=>bankIds.has(bank.id));
  const possibleDuplicates=raw.possibleDuplicates.map(group=>group.filter(bank=>bankIds.has(bank.id))).filter(group=>group.length>1);
  const matchedBankIds=new Set(matches.map(match=>match.bankTransactionId));
  const ignoredBankIds=new Set(raw.ignores.map(ignore=>ignore.bankTransactionId));
  const byAccount=scopedAccountRows.map(row=>{
    const importIds=raw.accountImportIds.get(row.account.id)||new Set<string>();
    const txs=bankTransactions.filter(bank=>importIds.has(bank.importId));
    const linked=matches.filter(match=>match.treasuryAccountId===row.account.id);
    return{...row,statementTransactions:txs.length,matched:linked.length,unmatched:txs.filter(bank=>!matchedBankIds.has(bank.id)&&!ignoredBankIds.has(bank.id)).length,importCount:importIds.size};
  });
  const data={
    ...raw,
    financeEntries,
    bankTransactions,
    matches,
    suggestions,
    unexplainedBank,
    missingInBank,
    unexpectedFees,
    possibleDuplicates,
    byAccount,
    summary:{financeTotal:financeEntries.length,bankTotal:bankTransactions.length,matched:matches.length,suggested:suggestions.length,unexplainedBank:unexplainedBank.length,missingInBank:missingInBank.length,duplicates:possibleDuplicates.reduce((sum,group)=>sum+group.length,0),unexpectedFees:unexpectedFees.length},
  };
  const scopeLabel=companyFundsFilterLabel(filters);

  return <div className="space-y-5">
    <div><p className="text-xs uppercase tracking-[.18em] text-muted2">Super Admin · Contrôle financier</p><h1 className="mt-1 text-3xl font-semibold">Réconciliation transaction par transaction</h1><p className="mt-1 max-w-4xl text-sm text-muted2">JUN compare les opérations Finance aux transactions bancaires importées afin de détecter les paiements absents, sorties inexpliquées, doublons, frais imprévus et écarts de montant.</p></div>

    {scopeLabel?<div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><Filter className="mr-2 inline h-4 w-4"/><strong>Périmètre actif :</strong> {scopeLabel}. Tous les compteurs, suggestions, anomalies et rapprochements ci-dessous sont recalculés sur ce périmètre.</div>:null}

    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Metric label="Finance" value={data.summary.financeTotal}/><Metric label="Banque" value={data.summary.bankTotal}/><Metric label="Rapprochées" value={data.summary.matched}/><Metric label="Suggestions" value={data.summary.suggested}/><Metric label="Banque inexpliquée" value={data.summary.unexplainedBank}/><Metric label="Absentes banque" value={data.summary.missingInBank}/><Metric label="Doublons" value={data.summary.duplicates}/><Metric label="Frais suspects" value={data.summary.unexpectedFees}/>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><SearchCheck className="h-5 w-5"/>Suggestions automatiques</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted2">Une suggestion exige même devise, sens cohérent, montant proche et date à ±7 jours. La référence augmente le score.</p>{data.suggestions.length?data.suggestions.slice(0,100).map(s=><div key={`${s.bank.id}:${s.finance.id}`} className="grid gap-3 rounded-xl border border-line p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-center"><div><div className="text-[10px] uppercase tracking-wide text-muted2">Finance JUN</div><div className="font-semibold">{s.finance.reference}</div><div className="text-xs text-muted2">{s.finance.category} · {formatMoney(s.finance.amount,s.finance.currency)} · {formatDateTime(s.finance.occurredAt)}</div></div><div><div className="text-[10px] uppercase tracking-wide text-muted2">Transaction bancaire</div><div className="font-semibold">{s.bank.description||s.bank.bankReference}</div><div className="text-xs text-muted2">{formatMoney(s.bank.amount,s.bank.currency)} · {formatDateTime(s.bank.date)} · score {s.score}%</div></div><form action={acceptTreasurySuggestedMatchAction.bind(null,s.finance.id,s.bank.id)}><button className="rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">Confirmer</button></form></div>):<Empty text="Aucune suggestion automatique dans le périmètre actuel."/>}</CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5"/>Transactions bancaires sans explication</CardTitle></CardHeader><CardContent className="space-y-2">{data.unexplainedBank.length?data.unexplainedBank.slice(0,100).map(b=><div key={b.id} className="rounded-xl border border-line p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{b.description||"Transaction bancaire"}</div><div className="text-xs text-muted2">{b.bankReference||"Sans référence"} · {formatDateTime(b.date)}</div></div><div className={`font-semibold ${b.amount<0?"text-red-700":"text-emerald-700"}`}>{formatMoney(b.amount,b.currency)}</div></div><form action={ignoreTreasuryBankTransactionAction.bind(null,b.id)} className="mt-2 flex gap-2"><input name="reason" placeholder="Motif si hors opérations JUN" className="min-w-0 flex-1 rounded border border-line px-2 py-1 text-xs"/><button className="rounded border border-line px-2 py-1 text-xs">Ignorer</button></form></div>):<Empty text="Aucune transaction bancaire inexpliquée dans le périmètre."/>}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5"/>Opérations Finance absentes du relevé</CardTitle></CardHeader><CardContent className="space-y-2">{data.missingInBank.length?data.missingInBank.slice(0,100).map(f=><div key={f.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3"><div><div className="font-medium">{f.reference}</div><div className="text-xs text-muted2">{f.category} · {formatDateTime(f.occurredAt)}{f.treasuryAccountId?" · compte affecté":" · compte non affecté"}</div></div><div className={`font-semibold ${f.direction==="OUT"?"text-red-700":"text-emerald-700"}`}>{f.direction==="OUT"?"−":"+"}{formatMoney(f.amount,f.currency)}</div></div>):<Empty text="Toutes les opérations Finance du périmètre ont une correspondance ou une suggestion."/>}</CardContent></Card>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><Copy className="h-5 w-5"/>Doublons bancaires potentiels</CardTitle></CardHeader><CardContent className="space-y-3">{data.possibleDuplicates.length?data.possibleDuplicates.slice(0,50).map((group,index)=><div key={index} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="text-xs font-semibold text-amber-800">{group.length} transactions · {formatMoney(group[0].amount,group[0].currency)} · {group[0].date.slice(0,10)}</div>{group.map(b=><div key={b.id} className="mt-1 text-xs text-amber-900">{b.description||"—"} · {b.bankReference||"sans référence"}</div>)}</div>):<Empty text="Aucun doublon potentiel détecté dans le périmètre."/>}</CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5"/>Frais bancaires imprévus</CardTitle></CardHeader><CardContent className="space-y-2">{data.unexpectedFees.length?data.unexpectedFees.slice(0,100).map(b=><div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3"><div><div className="font-medium text-red-900">{b.description||"Frais bancaire"}</div><div className="text-xs text-red-700">{b.bankReference||"—"} · {formatDateTime(b.date)}</div></div><div className="font-semibold text-red-700">{formatMoney(b.amount,b.currency)}</div></div>):<Empty text="Aucun frais bancaire imprévu détecté dans le périmètre."/>}</CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5"/>Couverture des comptes</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr className="border-b text-left text-xs text-muted2"><th className="p-2">Compte</th><th className="p-2">Pays</th><th className="p-2">Devise</th><th className="p-2 text-right">Relevés liés</th><th className="p-2 text-right">Transactions</th><th className="p-2 text-right">Rapprochées</th><th className="p-2 text-right">Non rapprochées</th></tr></thead><tbody>{data.byAccount.map(r=><tr key={r.account.id} className="border-b border-line/70"><td className="p-2 font-medium">{r.account.name}<div className="text-[10px] text-muted2">{r.account.institution}</div></td><td className="p-2">{r.account.country}</td><td className="p-2">{r.account.currency}</td><td className="p-2 text-right">{r.importCount}</td><td className="p-2 text-right">{r.statementTransactions}</td><td className="p-2 text-right text-emerald-700">{r.matched}</td><td className="p-2 text-right text-amber-700">{r.unmatched}</td></tr>)}</tbody></table></div>{!data.byAccount.length?<Empty text="Aucun compte ne correspond au périmètre sélectionné."/>:null}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5"/>Rapprochements confirmés</CardTitle></CardHeader><CardContent>{data.matches.length?<div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b text-left text-xs text-muted2"><th className="p-2">Finance</th><th className="p-2">Banque</th><th className="p-2">Méthode</th><th className="p-2 text-right">Écart</th><th className="p-2">Date</th></tr></thead><tbody>{data.matches.slice(0,200).map(m=>{const f=data.financeEntries.find(e=>e.id===m.financeEntryId);const b=data.bankTransactions.find(e=>e.id===m.bankTransactionId);return <tr key={m.id} className="border-b border-line/70"><td className="p-2">{f?.reference||m.financeEntryId}</td><td className="p-2">{b?.description||b?.bankReference||m.bankTransactionId}</td><td className="p-2">{m.method}</td><td className="p-2 text-right">{f?formatMoney(m.amountDifference,f.currency):m.amountDifference}</td><td className="p-2 text-xs">{formatDateTime(m.matchedAt)}</td></tr>})}</tbody></table></div>:<Empty text="Aucun rapprochement confirmé dans le périmètre sélectionné."/>}</CardContent></Card>
  </div>
}

function Metric({label,value}:{label:string;value:number}){return <div className="rounded-xl border border-line bg-white p-3"><div className="text-[10px] uppercase tracking-wide text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>}
function Empty({text}:{text:string}){return <div className="rounded-xl bg-surface p-4 text-sm text-muted2">{text}</div>}
