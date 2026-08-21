import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { CHART_OF_ACCOUNTS, getClosedPeriods, listJournalEntries } from "@/lib/finance-accounting";
import { syncAccountingLedgerAction } from "@/services/finance-accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { BookOpen, FileSpreadsheet, LockKeyhole, RefreshCw } from "lucide-react";

export const dynamic="force-dynamic";

export default async function AccountingLedgerPage({searchParams}:{searchParams:{success?:string;error?:string}}){
  const user=await requirePermission("ACCOUNTING_READ");
  const [entries,closed]=await Promise.all([listJournalEntries(250),getClosedPeriods()]);
  const currencies=[...new Set(entries.map(e=>e.currency))].sort();
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Accounting</p><h1 className="mt-1 text-3xl font-semibold">General Ledger</h1><p className="mt-1 text-sm text-muted2">Immutable double-entry journal synchronized from confirmed Finance events.</p></div><div className="flex flex-wrap gap-2"><Link href="/app/finance/accounting/statements" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><FileSpreadsheet className="h-4 w-4"/>Financial statements</Link><Link href="/app/finance/accounting/close" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><LockKeyhole className="h-4 w-4"/>Month close</Link>{can(user,"ACCOUNTING_POST")&&<form action={syncAccountingLedgerAction}><button className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white"><RefreshCw className="h-4 w-4"/>Sync ledger</button></form>}</div></div>
    {searchParams.success&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{searchParams.success}</div>}
    {searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{searchParams.error}</div>}
    <div className="grid gap-3 md:grid-cols-4"><Metric label="Journal entries" value={String(entries.length)}/><Metric label="Currencies" value={String(currencies.length)}/><Metric label="Closed periods" value={String(closed.length)}/><Metric label="Chart accounts" value={String(CHART_OF_ACCOUNTS.length)}/></div>
    <Card><CardHeader><CardTitle>Chart of accounts</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{CHART_OF_ACCOUNTS.map(a=><div key={a.code} className="rounded-lg border border-line px-3 py-2"><div className="registry-id text-xs">{a.code}</div><div className="text-sm font-medium">{a.name}</div><div className="text-[11px] text-muted2">{a.type.replaceAll("_"," ")}</div></div>)}</div></CardContent></Card>
    <Card><CardHeader><CardTitle>Recent journal entries</CardTitle></CardHeader><CardContent>{entries.length?<div className="space-y-3">{entries.slice(0,50).map(e=><div key={e.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="registry-id text-sm">{e.entryNumber}</div><div className="mt-1 text-sm font-medium">{e.description}</div><div className="text-xs text-muted2">{formatDateTime(new Date(e.date))} · {e.sourceType.replaceAll("_"," ")} · SHA {e.hash.slice(0,12)}…</div></div>{e.sourceHref?<Link href={e.sourceHref} className="text-xs font-medium text-electric">Open source →</Link>:null}</div><div className="mt-3 overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted2"><th className="py-1">Account</th><th className="py-1 text-right">Debit</th><th className="py-1 text-right">Credit</th></tr></thead><tbody>{e.lines.map((l,i)=><tr key={`${e.id}-${i}`} className="border-t border-line"><td className="py-1.5">{l.accountCode} · {l.accountName}</td><td className="py-1.5 text-right">{l.debit?formatMoney(l.debit,e.currency):"—"}</td><td className="py-1.5 text-right">{l.credit?formatMoney(l.credit,e.currency):"—"}</td></tr>)}</tbody></table></div></div>)}</div>:<div className="text-sm text-muted2"><BookOpen className="mb-2 h-5 w-5"/>No journal entries yet. Use Sync ledger after Finance transactions exist.</div>}</CardContent></Card>
  </div>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>}
