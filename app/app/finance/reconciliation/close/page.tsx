import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBankPeriodCloses, listStatementImports } from "@/lib/finance-bank-reconciliation";
import { closeBankReconciliationPeriodAction } from "@/services/finance-bank-reconciliation";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function BankReconciliationClosePage({searchParams}:{searchParams:{success?:string;error?:string}}){
  await requirePermission("BANK_RECON_CLOSE");const [imports,closes]=await Promise.all([listStatementImports(),listBankPeriodCloses()]);
  const accounts=[...new Map(imports.map(i=>[`${i.accountLabel}|${i.currency}`,{accountLabel:i.accountLabel,currency:i.currency,bankName:i.bankName}])).values()];
  return <div className="mx-auto w-full min-w-0 max-w-4xl space-y-5 pb-4">
    <div><Link href="/app/finance/reconciliation" className="text-xs font-medium text-electric">← Rapprochement bancaire</Link><h1 className="mt-2 break-words text-2xl sm:text-3xl font-semibold">Clôture du rapprochement</h1><p className="mt-1 text-sm text-muted2">Toutes les transactions importées du mois, du compte et de la devise sélectionnés doivent être rapprochées ou explicitement ignorées.</p></div>
    {searchParams.success&&<div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{searchParams.success}</div>}{searchParams.error&&<div className="rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{searchParams.error}</div>}
    {accounts.length>0&&<Card><CardHeader><CardTitle>Comptes bancaires importés</CardTitle></CardHeader><CardContent><div className="grid gap-2 md:grid-cols-2">{accounts.map(a=><div key={`${a.accountLabel}|${a.currency}`} className="min-w-0 break-words rounded-xl border border-line bg-white/[0.025] p-3"><div className="text-sm font-medium">{a.bankName}</div><div className="break-words text-xs text-muted2">Compte : <span className="font-medium text-ink">{a.accountLabel}</span> · Devise : <span className="font-medium text-ink">{a.currency}</span></div></div>)}</div></CardContent></Card>}
    <Card><CardHeader><CardTitle>Clôturer la période</CardTitle></CardHeader><CardContent><form action={closeBankReconciliationPeriodAction} className="grid gap-4 md:grid-cols-2">
      <label className="min-w-0 text-sm">Mois<input type="month" name="period" required className="mt-1 min-h-11 w-full min-w-0 max-w-full bg-surface text-base rounded-xl border border-line px-3 py-2"/></label>
      <label className="min-w-0 text-sm">Libellé du compte<input name="accountLabel" required className="mt-1 min-h-11 w-full min-w-0 max-w-full bg-surface text-base rounded-xl border border-line px-3 py-2" placeholder="Libellé exact du compte importé"/></label>
      <label className="min-w-0 text-sm">Devise<input name="currency" required maxLength={3} className="mt-1 min-h-11 w-full min-w-0 max-w-full bg-surface text-base rounded-xl border border-line px-3 py-2 uppercase" placeholder="USD"/></label>
      <label className="min-w-0 text-sm">Confirmation<input name="confirmation" required className="mt-1 min-h-11 w-full min-w-0 max-w-full bg-surface text-base rounded-xl border border-red-400/30 px-3 py-2" placeholder="Saisissez CLOSE"/></label>
      <label className="text-sm md:col-span-2">Note de clôture<textarea name="note" rows={3} className="mt-1 min-h-11 w-full min-w-0 max-w-full bg-surface text-base rounded-xl border border-line px-3 py-2" placeholder="Note facultative sur la clôture"/></label>
      <div className="md:col-span-2"><button className="min-h-11 w-full rounded-xl bg-electric px-4 py-2 sm:w-auto text-sm font-medium text-white">Clôturer la période</button></div>
    </form><p className="mt-3 text-xs text-muted2">Le libellé du compte et la devise doivent correspondre exactement au relevé importé. Cette clôture ne modifie pas le grand livre comptable.</p></CardContent></Card>
    <Card><CardHeader><CardTitle>Périodes clôturées</CardTitle></CardHeader><CardContent>{closes.length?<div className="divide-y divide-line rounded-lg border border-line">{closes.map((c,i)=><div key={`${c.period}-${c.currency}-${i}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3"><div><div className="break-words font-medium">{c.period} · {c.accountLabel}</div><div className="break-words text-xs text-muted2">{c.currency} · {c.note||"Sans note"}</div></div><div className="break-words text-xs text-muted2">{formatDateTime(new Date(c.closedAt))}</div></div>)}</div>:<p className="text-sm text-muted2">Aucune période clôturée.</p>}</CardContent></Card>
  </div>;
}
