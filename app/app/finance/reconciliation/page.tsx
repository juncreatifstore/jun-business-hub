import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import {
  listBankPeriodCloses,
  listBankTransactions,
  listReconciliationMatches,
  listStatementImports,
} from "@/lib/finance-bank-reconciliation";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, CheckCircle2, Download, FileUp, LockKeyhole, SearchX } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  await requirePermission("BANK_RECON_READ");
  const [imports, transactions, matches, closes] = await Promise.all([
    listStatementImports(),
    listBankTransactions(),
    listReconciliationMatches(),
    listBankPeriodCloses(),
  ]);
  const matched = transactions.filter((t) => t.status === "MATCHED").length,
    unresolved = transactions.filter((t) => ["UNMATCHED", "SUGGESTED"].includes(t.status)).length;
  const rate = transactions.length ? Math.round((matched / transactions.length) * 100) : 0;
  return (
    <div className="space-y-5 pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-muted2">Contrôle Finance</p>
          <h1 className="mt-1 break-words text-2xl font-semibold sm:text-3xl">Réconciliation bancaire</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted2">
            Importez les relevés, comparez les mouvements bancaires avec le registre comptable et validez les
            correspondances.
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
          <a
            href="/api/finance/reconciliation/export.csv"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-ink/[0.03] px-3 py-2 text-xs font-medium"
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </a>
          <Link
            href="/app/finance/reconciliation/import"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-electric px-3 py-2 text-xs font-medium text-white"
          >
            <FileUp className="h-4 w-4" />
            Importer un relevé
          </Link>
          <Link
            href="/app/finance/reconciliation/close"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-ink/[0.03] px-3 py-2 text-xs font-medium"
          >
            <LockKeyhole className="h-4 w-4" />
            Clôture mensuelle
          </Link>
        </div>
      </div>
      {searchParams.success && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {searchParams.success}
        </div>
      )}
      {searchParams.error && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
          {searchParams.error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Imports" value={String(imports.length)} hint="Relevés importés" />
        <Metric label="Transactions" value={String(transactions.length)} hint="Mouvements normalisés" />
        <Metric label="Réconcilié" value={`${rate}%`} hint={`${matched} correspondances`} />
        <Metric label="À traiter" value={String(unresolved)} hint="Non rapproché ou suggéré" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Relevés importés</CardTitle>
          </CardHeader>
          <CardContent>
            {imports.length ? (
              <div className="space-y-3 md:space-y-0 md:divide-y md:divide-line md:rounded-xl md:border md:border-line">
                {imports.slice(0, 20).map((i) => {
                  const tx = transactions.filter((t) => t.importId === i.id);
                  const done = tx.filter((t) => ["MATCHED", "IGNORED"].includes(t.status)).length;
                  const progress = tx.length ? Math.round((done / tx.length) * 100) : 0;
                  return (
                    <Link
                      key={i.id}
                      href={`/app/finance/reconciliation/${i.id}`}
                      className="block rounded-2xl border border-line bg-ink/[0.025] p-4 transition hover:bg-ink/[0.04] md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-medium">
                            {i.bankName} · {i.accountLabel}
                          </div>
                          <div className="mt-1 break-all text-xs leading-relaxed text-muted2">
                            {i.fileName}
                          </div>
                          <div className="mt-1 text-[11px] text-muted2">
                            {i.currency} · {formatDateTime(new Date(i.importedAt))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">
                            {done}/{tx.length}
                          </div>
                          <div className="text-[10px] text-muted2">résolu</div>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div className="h-full rounded-full bg-electric" style={{ width: `${progress}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted2">Aucun relevé bancaire importé.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>État du contrôle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Status icon={CheckCircle2} label="Correspondances confirmées" value={matches.length} />
            <Status icon={SearchX} label="Transactions non résolues" value={unresolved} />
            <Status icon={LockKeyhole} label="Périodes clôturées" value={closes.length} />
            <Link
              href="/app/finance/accounting"
              className="inline-flex min-h-10 items-center gap-2 pt-2 text-xs font-medium text-electric"
            >
              Ouvrir le grand livre <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-ink/[0.025] p-3 sm:p-4">
      <div className="text-[11px] text-muted2 sm:text-xs">{label}</div>
      <div className="mt-1 break-words text-xl font-semibold sm:text-2xl">{value}</div>
      <div className="mt-1 break-words text-[10px] leading-relaxed text-muted2 sm:text-xs">{hint}</div>
    </div>
  );
}
function Status({ icon: Icon, label, value }: { icon: typeof CheckCircle2; label: string; value: number }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-ink/[0.02] p-3">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <Icon className="h-4 w-4 shrink-0 text-muted2" />
        <span className="break-words">{label}</span>
      </div>
      <div className="shrink-0 font-semibold">{value}</div>
    </div>
  );
}
