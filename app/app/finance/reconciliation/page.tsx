import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBankPeriodCloses, listBankTransactions, listReconciliationMatches, listStatementImports } from "@/lib/finance-bank-reconciliation";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, CheckCircle2, FileUp, LockKeyhole, SearchX } from "lucide-react";

export const dynamic="force-dynamic";

export default async function ReconciliationPage({searchParams}:{searchParams:{success?:string;error?:string}}){
  await requirePermission("BANK_RECON_READ");
  const [imports,transactions,matches,closes]=await Promise.all([listStatementImports(),listBankTransactions(),listReconciliationMatches(),listBankPeriodCloses()]);
  const matched=transactions.filter(t=>t.status==="MATCHED").length, unresolved=transactions.filter(t=>["UNMATCHED","SUGGESTED"].includes(t.status)).length;
  const rate=transactions.length?Math.round((matched/transactions.length)*100):0;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Finance control</p><h1 className="mt-1 text-3xl font-semibold">Bank Reconciliation</h1><p className="mt-1 text-sm text-muted2">Import bank statements, compare bank movements with the accounting ledger and validate matches.</p></div><div className="flex gap-2"><Link href="/app/finance/reconciliation/import" className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white"><FileUp className="h-4 w-4"/>Import statement</Link><Link href="/app/finance/reconciliation/close" className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium"><LockKeyhole className="h-4 w-4"/>Month close</Link></div></div>
    {searchParams.success&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.success}</div>}{searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}
    <div className="grid gap-3 md:grid-cols-4"><Metric label="Imports" value={String(imports.length)} hint="Statement files"/><Metric label="Transactions" value={String(transactions.length)} hint="Normalized bank movements"/><Metric label="Reconciled" value={`${rate}%`} hint={`${matched} matched`}/><Metric label="Need attention" value={String(unresolved)} hint="Unmatched or suggested"/></div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Statement imports</CardTitle></CardHeader><CardContent>{imports.length?<div className="divide-y divide-line rounded-lg border border-line">{imports.slice(0,20).map(i=>{const tx=transactions.filter(t=>t.importId===i.id);const done=tx.filter(t=>["MATCHED","IGNORED"].includes(t.status)).length;return <Link key={i.id} href={`/app/finance/reconciliation/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface"><div><div className="text-sm font-medium">{i.bankName} · {i.accountLabel}</div><div className="text-xs text-muted2">{i.fileName} · {i.currency} · {formatDateTime(new Date(i.importedAt))}</div></div><div className="text-right"><div className="text-sm font-medium">{done}/{tx.length}</div><div className="text-[11px] text-muted2">resolved</div></div></Link>})}</div>:<p className="text-sm text-muted2">No bank statements imported yet.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Control status</CardTitle></CardHeader><CardContent className="space-y-3"><Status icon={CheckCircle2} label="Confirmed matches" value={matches.length}/><Status icon={SearchX} label="Unresolved transactions" value={unresolved}/><Status icon={LockKeyhole} label="Closed reconciliation periods" value={closes.length}/><Link href="/app/finance/accounting" className="inline-flex items-center gap-2 pt-2 text-xs font-medium text-electric">Open Accounting Ledger <ArrowRight className="h-3 w-3"/></Link></CardContent></Card>
    </div>
  </div>;
}
function Metric({label,value,hint}:{label:string;value:string;hint:string}){return <div className="rounded-xl border border-line bg-white p-4"><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>}
function Status({icon:Icon,label,value}:{icon:typeof CheckCircle2;label:string;value:number}){return <div className="flex items-center justify-between rounded-lg border border-line p-3"><div className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-muted2"/>{label}</div><div className="font-semibold">{value}</div></div>}
