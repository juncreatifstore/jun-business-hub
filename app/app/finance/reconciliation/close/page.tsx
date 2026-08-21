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
    <Card><CardHeader><CardTitle>Close reconciliation period</CardTitle></CardHeader><CardContent><form action={closeBankReconciliationPeriodAction} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">Period<input type="month" name="period" required className="mt-1 w-full rounded-lg border border-line px-3 py-2"/></label>
      <label className="text-sm">Account<select name="accountKey" className="hidden"/><select required name="accountChoice" className="mt-1 w-full rounded-lg border border-line px-3 py-2" onChange={undefined}><option value="">Select account</option>{accounts.map(a=><option key={`${a.accountLabel}|${a.currency}`} value={`${a.accountLabel}|${a.currency}`}>{a.bankName} · {a.accountLabel} · {a.currency}</option>)}</select></label>
      <label className="text-sm">Account label<input name="accountLabel" required className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Enter exactly as imported"/></label>
      <label className="text-sm">Currency<input name="currency" required maxLength={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 uppercase" placeholder="USD"/></label>
      <label className="text-sm md:col-span-2">Close note<textarea name="note" rows={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Optional month-end reconciliation note"/></label>
      <label className="text-sm md:col-span-2">Confirmation<input name="confirmation" required className="mt-1 w-full rounded-lg border border-red-200 px-3 py-2" placeholder="Type CLOSE"/></label>
      <div className="md:col-span-2"><button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Close reconciliation period</button></div>
    </form><p className="mt-3 text-xs text-muted2">The account selector above is a reference aid; account label and currency are entered explicitly to avoid closing the wrong bank account.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Closed periods</CardTitle></CardHeader><CardContent>{closes.length?<div className="divide-y divide-line rounded-lg border border-line">{closes.map((c,i)=><div key={`${c.period}-${c.currency}-${i}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><div className="font-medium">{c.period} · {c.accountLabel}</div><div className="text-xs text-muted2">{c.currency} · {c.note||"No note"}</div></div><div className="text-xs text-muted2">{formatDateTime(new Date(c.closedAt))}</div></div>)}</div>:<p className="text-sm text-muted2">No reconciliation periods closed yet.</p>}</CardContent></Card>
  </div>;
}
