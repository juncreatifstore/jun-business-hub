import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBankPeriodCloses, listStatementImports } from "@/lib/finance-bank-reconciliation";
import { closeBankReconciliationPeriodAction } from "@/services/finance-bank-reconciliation";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BankReconciliationClosePage({searchParams}:{searchParams:{success?:string;error?:string}}){
  await requirePermission("BANK_RECON_CLOSE");const [imports,closes]=await Promise.all([listStatementImports(),listBankPeriodCloses()]);
  const accounts=[...new Map(imports.map(i=>[`${i.accountLabel}|${i.currency}`,{accountLabel:i.accountLabel,currency:i.currency,bankName:i.bankName}])).values()];
  return <div className="mx-auto max-w-4xl space-y-5">
    <div><Link href="/app/finance/reconciliation" className="text-xs font-medium text-electric">← Bank reconciliation</Link><h1 className="mt-2 text-3xl font-semibold">Reconciliation Month Close</h1><p className="mt-1 text-sm text-muted2">A month can close only when every imported transaction for the selected account and currency is matched or explicitly ignored.</p></div>
    {searchParams.success&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.success}</div>}{searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}
    {accounts.length>0&&<Card><CardHeader><CardTitle>Imported bank accounts</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2">{accounts.map(a=><div key={`${a.accountLabel}|${a.currency}`} className="rounded-lg border border-line bg-surface p-3"><div className="text-sm font-medium">{a.bankName}</div><div className="text-xs text-muted2">Account label: <span className="font-medium text-ink">{a.accountLabel}</span> · Currency: <span className="font-medium text-ink">{a.currency}</span></div></div>)}</div></CardContent></Card>}
    <Card><CardHeader><CardTitle>Close reconciliation period</CardTitle></CardHeader><CardContent><form action={closeBankReconciliationPeriodAction} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">Period<input type="month" name="period" required className="mt-1 w-full rounded-lg border border-line px-3 py-2"/></label>
      <label className="text-sm">Account label<input name="accountLabel" required className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Enter exactly as imported"/></label>
      <label className="text-sm">Currency<input name="currency" required maxLength={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 uppercase" placeholder="USD"/></label>
      <label className="text-sm">Confirmation<input name="confirmation" required className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2" placeholder="Type CLOSE"/></label>
      <label className="text-sm md:col-span-2">Close note<textarea name="note" rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Optional month-end reconciliation note"/></label>
      <div className="md:col-span-2"><button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Close reconciliation period</button></div>
    </form><p className="mt-3 text-xs text-muted2">Account label and currency must exactly match an imported statement account. Closing does not alter the accounting ledger.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Closed periods</CardTitle></CardHeader><CardContent>{closes.length?<div className="divide-y divide-line rounded-lg border border-line">{closes.map((c,i)=><div key={`${c.period}-${c.currency}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><div className="font-medium">{c.period} · {c.accountLabel}</div><div className="text-xs text-muted2">{c.currency} · {c.note||"No note"}</div></div><div className="text-xs text-muted2">{formatDateTime(new Date(c.closedAt))}</div></div>)}</div>:<p className="text-sm text-muted2">No reconciliation periods closed yet.</p>}</CardContent></Card>
  </div>;
}
