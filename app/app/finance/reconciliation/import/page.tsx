import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { importBankStatementAction } from "@/services/finance-bank-reconciliation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BankStatementImportPage({searchParams}:{searchParams:{error?:string}}){
  await requirePermission("BANK_RECON_IMPORT");
  return <div className="mx-auto max-w-3xl space-y-5">
    <div><Link href="/app/finance/reconciliation" className="text-xs font-medium text-electric">← Bank reconciliation</Link><h1 className="mt-2 text-3xl font-semibold">Import bank statement</h1><p className="mt-1 text-sm text-muted2">CSV and OFX/QFX are supported. JUN stores normalized transaction metadata and a SHA-256 file fingerprint, not the raw statement content.</p></div>
    {searchParams.error&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div>}
    <Card><CardHeader><CardTitle>Statement information</CardTitle></CardHeader><CardContent><form action={importBankStatementAction} className="grid gap-4 md:grid-cols-2">
      <label className="text-sm">Bank name<input name="bankName" required className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="e.g. Chase, BBVA, Unibank"/></label>
      <label className="text-sm">Account label<input name="accountLabel" required className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="Operating USD"/></label>
      <label className="text-sm">Account last 4 digits<input name="accountLast4" maxLength={4} className="mt-1 w-full rounded-lg border border-line px-3 py-2" placeholder="1234"/></label>
      <label className="text-sm">Currency<input name="currency" required defaultValue="USD" maxLength={3} className="mt-1 w-full rounded-lg border border-line px-3 py-2 uppercase"/></label>
      <label className="text-sm md:col-span-2">CSV / OFX statement<input type="file" name="statement" required accept=".csv,.ofx,.qfx,text/csv,application/x-ofx" className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"/></label>
      <div className="md:col-span-2 rounded-lg border border-line bg-surface p-3 text-xs text-muted2">CSV requires Date + Description + Amount, or Date + Description + Debit/Credit. Common bank column names are detected automatically. Maximum file size: 8 MB.</div>
      <div className="md:col-span-2"><button className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">Import and analyze</button></div>
    </form></CardContent></Card>
  </div>;
}
