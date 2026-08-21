import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/lib/auth";
import { getStatementImport, listBankTransactions, listReconciliationMatches } from "@/lib/finance-bank-reconciliation";
import { listJournalEntries } from "@/lib/finance-accounting";
import { formatDate, formatMoney } from "@/lib/utils";
import { confirmBankMatchAction, ignoreBankTransactionAction, refreshBankSuggestionsAction } from "@/services/finance-bank-reconciliation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic="force-dynamic";
function cashMovement(lines:{accountCode:string;debit:number;credit:number}[]){return Math.round(lines.filter(l=>l.accountCode==="1000").reduce((s,l)=>s+l.debit-l.credit,0)*100)/100;}

export default async function ReconciliationImportPage({params,searchParams}:{params:{id:string};searchParams:{success?:string;error?:string}}){
  const user=await requirePermission("BANK_RECON_READ");const record=await getStatementImport(params.id);if(!record)notFound();
  const [transactions,matches,entries]=await Promise.all([listBankTransactions(record.id),listReconciliationMatches(),listJournalEntries(5000)]);const canApprove=can(user,"BANK_RECON_APPROVE");
  const matchByTx=new Map(matches.map(m=>[m.transactionId,m]));const matched=transactions.filter(t=>t.status==="MATCHED").length;const unresolved=transactions.filter(t=>["UNMATCHED","SUGGESTED"].includes(t.status)).length;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link href="/app/finance/reconciliation" className="text-xs font-medium text-electric">← Bank reconciliation</Link><h1 className="mt-2 text-3xl font-semibold">{record.bankName} · {record.accountLabel}</h1><p className="mt-1 text-sm text-muted2">{record.fileName} · {record.currency} · {transactions.length} imported transaction(s) · {record.duplicateCount} duplicate(s) skipped</p></div>{canApprove&&<form action={refreshBankSuggestionsAction.bind(null,record.id)}><button className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Refresh suggestions</button></form>}</div>
    {searchParams.success&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.success}</div>}{searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}
    <div className="grid gap-3 md:grid-cols-4"><Metric label="Transactions" value={String(transactions.length)}/><Metric label="Matched" value={String(matched)}/><Metric label="Need attention" value={String(unresolved)}/><Metric label="Resolution" value={`${transactions.length?Math.round(((transactions.length-unresolved)/transactions.length)*100):0}%`}/></div>
    <Card><CardHeader><CardTitle>Bank transactions</CardTitle></CardHeader><CardContent><div className="space-y-3">{transactions.sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map(tx=>{
      const confirmed=matchByTx.get(tx.id);const suggested=tx.suggestedEntryId?entries.find(e=>e.id===tx.suggestedEntryId):null;const compatible=entries.filter(e=>e.currency===tx.currency&&Math.abs(cashMovement(e.lines)-tx.amount)<=0.01).sort((a,b)=>Math.abs(new Date(a.date).getTime()-new Date(tx.date).getTime())-Math.abs(new Date(b.date).getTime()-new Date(tx.date).getTime())).slice(0,12);
      return <div key={tx.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="text-sm font-semibold">{formatMoney(tx.amount,tx.currency)}</span><Status status={tx.status}/>{tx.suggestedScore!==null&&tx.status==="SUGGESTED"&&<span className="text-[11px] text-muted2">score {tx.suggestedScore}%</span>}</div><div className="mt-1 text-sm">{tx.description||"Bank transaction"}</div><div className="mt-1 text-xs text-muted2">{formatDate(new Date(tx.date))} · ref {tx.bankReference||"—"}</div></div>{confirmed&&<div className="text-right text-xs"><div className="font-medium text-emerald-700">Reconciled</div><div className="text-muted2">{confirmed.method.replaceAll("_"," ")} · Δ {confirmed.amountDifference.toFixed(2)}</div></div>}</div>
        {tx.status==="SUGGESTED"&&suggested&&<div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs"><div className="font-medium">Suggested ledger match</div><div className="mt-1">{suggested.entryNumber} · {suggested.description} · {formatMoney(cashMovement(suggested.lines),suggested.currency)} · {formatDate(new Date(suggested.date))}</div></div>}
        {canApprove&&!["MATCHED","IGNORED"].includes(tx.status)&&<div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
          <form action={confirmBankMatchAction} className="flex flex-wrap items-end gap-2"><input type="hidden" name="transactionId" value={tx.id}/><label className="min-w-[280px] flex-1 text-xs">Ledger entry<select name="journalEntryId" required defaultValue={tx.suggestedEntryId||""} className="mt-1 w-full rounded-lg border border-line px-3 py-2"><option value="">Select matching ledger entry</option>{compatible.map(e=><option key={e.id} value={e.id}>{e.entryNumber} · {e.description} · {formatMoney(cashMovement(e.lines),e.currency)} · {formatDate(new Date(e.date))}</option>)}</select></label><label className="min-w-[180px] flex-1 text-xs">Review note<input name="note" className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Optional note"/></label><button className="rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white">Confirm match</button></form>
          <form action={ignoreBankTransactionAction}><input type="hidden" name="transactionId" value={tx.id}/><button className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Ignore</button></form>
        </div>}
      </div>})}</div></CardContent></Card>
  </div>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>}
function Status({status}:{status:string}){const cls=status==="MATCHED"?"bg-emerald-100 text-emerald-800":status==="SUGGESTED"?"bg-blue-100 text-blue-800":status==="IGNORED"?"bg-slate-100 text-slate-700":"bg-amber-100 text-amber-800";return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>}
