import { requirePermission, can } from "@/lib/auth";
import { getClosedPeriods } from "@/lib/finance-accounting";
import { closeAccountingPeriodAction } from "@/services/finance-accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

export const dynamic="force-dynamic";

export default async function AccountingClosePage({searchParams}:{searchParams:{success?:string;error?:string}}){
  const user=await requirePermission("ACCOUNTING_READ");
  const periods=(await getClosedPeriods()).sort((a,b)=>b.period.localeCompare(a.period));
  const now=new Date();const current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  return <div className="space-y-5">
    <div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Accounting</p><h1 className="mt-1 text-3xl font-semibold">Month Close</h1><p className="mt-1 text-sm text-muted2">Lock an accounting period after synchronizing all eligible Finance events.</p></div>
    {searchParams.success&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{searchParams.success}</div>}
    {searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{searchParams.error}</div>}
    {can(user,"ACCOUNTING_CLOSE")&&<Card><CardHeader><CardTitle>Close accounting period</CardTitle></CardHeader><CardContent><form action={closeAccountingPeriodAction} className="grid gap-4 md:grid-cols-2"><label className="text-sm">Period<input name="period" type="month" defaultValue={current} required className="mt-1 block w-full rounded-lg border border-line px-3 py-2"/></label><label className="text-sm">Confirmation<input name="confirmation" placeholder="Type CLOSE" required className="mt-1 block w-full rounded-lg border border-line px-3 py-2"/></label><label className="text-sm md:col-span-2">Close note<textarea name="note" rows={3} placeholder="Reconciliation completed, statements reviewed…" className="mt-1 block w-full rounded-lg border border-line px-3 py-2"/></label><div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Closing a period prevents new automatic ledger postings dated inside that month. This action is intentionally restrictive and should be performed only after review.</div><button className="w-fit rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Synchronize & close period</button></form></CardContent></Card>}
    <Card><CardHeader><CardTitle>Closed periods</CardTitle></CardHeader><CardContent>{periods.length?<div className="divide-y divide-line rounded-lg border border-line">{periods.map(p=><div key={p.period} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><div className="registry-id">{p.period}</div><div className="text-xs text-muted2">Closed {formatDateTime(new Date(p.closedAt))}</div></div><div className="max-w-xl text-right text-xs text-muted2">{p.note||"No note"}</div></div>)}</div>:<p className="text-sm text-muted2">No accounting periods have been closed yet.</p>}</CardContent></Card>
  </div>;
}
