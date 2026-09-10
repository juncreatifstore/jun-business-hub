import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getFinanceControlCenter } from "@/lib/finance-control-center";
import { getAccountsReceivableSnapshot } from "@/lib/finance-invoices";
import { expenseRemaining } from "@/lib/finance-expenses";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  Banknote,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  Landmark,
  ReceiptText,
  RefreshCw,
  Target,
  WalletCards,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FinanceControlCenterPage() {
  await requirePermission("PAYMENT_READ");
  const [data, ar] = await Promise.all([getFinanceControlCenter(), getAccountsReceivableSnapshot()]);
  const alertTotal = Object.values(data.alerts.counts).reduce((sum, value) => sum + value, 0);
  const arOpen = ar.rows.filter((r) => r.balance > 0).length;
  const arOverdue = ar.rows.filter((r) => r.overdue && r.balance > 0).length;

  return (
    <div className="space-y-4 pb-24 sm:space-y-5 sm:pb-0">
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <div className="relative p-4 sm:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.08),transparent_38%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-electric">
                Finance · Centre de contrôle
              </p>
              <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Pilotage financier</h1>
              <p className="mt-1 text-xs leading-5 text-muted2 sm:max-w-3xl sm:text-sm">
                Trésorerie, encaissements, créances, remboursements, dépenses, budgets et exceptions
                opérationnelles dans une seule vue. Les devises restent toujours séparées.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <a
                href="/api/finance/export.csv"
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-2 text-[11px] font-medium hover:bg-surface sm:gap-2 sm:px-3 sm:text-xs"
              >
                <Download className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                <span className="truncate">Exporter CSV</span>
              </a>
              <Link
                href="/app/finance/reports"
                className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-white px-2.5 py-2 text-[11px] font-medium hover:bg-surface sm:gap-2 sm:px-3 sm:text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                Rapports
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Devises suivies"
          value={String(data.currencies.length)}
          hint={`${data.ytdPaymentCount} paiements confirmés cette année`}
        />
        <Metric
          icon={FileText}
          label="Créances clients"
          value={String(arOpen)}
          hint={`${arOverdue} facture${arOverdue === 1 ? "" : "s"} en retard`}
        />
        <Metric
          icon={Landmark}
          label="Comptes de réception"
          value={`${data.accounts.active}/${data.accounts.total}`}
          hint="Actifs / configurés"
        />
        <Metric
          icon={WalletCards}
          label="Paiements en ligne"
          value={String(data.online.paid)}
          hint={`${data.online.pending} en attente · ${data.online.attention} à vérifier`}
        />
        <Metric
          icon={CircleDollarSign}
          label="Dettes fournisseurs"
          value={String(data.expenses.open)}
          hint={`${data.expenses.overdue} en retard`}
        />
        <Metric
          icon={Target}
          label="Alertes budget"
          value={String(data.budgets.varianceAlerts)}
          hint={`${data.budgets.active} budget${data.budgets.active === 1 ? "" : "s"} actif${data.budgets.active === 1 ? "" : "s"}`}
        />
        <Metric
          icon={AlertTriangle}
          label="Alertes opérationnelles"
          value={String(alertTotal + arOverdue)}
          hint="Éléments nécessitant une action"
          emphasis={alertTotal + arOverdue > 0}
        />
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Trésorerie par devise</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {data.currencies.length ? (
              <div className="grid gap-2.5 md:grid-cols-2 sm:gap-3">
                {data.currencies.map((row) => (
                  <div
                    key={row.currency}
                    className="min-w-0 rounded-2xl border border-line bg-surface/60 p-3.5 sm:p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="registry-id text-sm">{row.currency}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold sm:text-[10px] ${row.netCash >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                      >
                        {row.netCash >= 0 ? "POSITIVE" : "NÉGATIVE"}
                      </span>
                    </div>
                    <div className="mt-3 truncate text-xl font-semibold sm:text-2xl">
                      {formatMoney(row.netCash, row.currency)}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Mini label="Encaissé" value={formatMoney(row.collected, row.currency)} />
                      <Mini label="Frais" value={formatMoney(row.fees, row.currency)} />
                      <Mini label="Remboursé" value={formatMoney(row.refundsPaid, row.currency)} />
                      <Mini label="Dépenses" value={formatMoney(row.expensesPaid, row.currency)} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted2">Aucun mouvement financier confirmé.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Ancienneté des créances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 sm:px-6">
            {ar.byCurrency.length ? (
              ar.byCurrency.map((row) => (
                <Link
                  key={row.currency}
                  href="/app/finance/invoices"
                  className="block min-w-0 rounded-xl border border-line p-3 hover:bg-surface"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="registry-id">{row.currency}</span>
                    <strong className="truncate text-sm sm:text-base">
                      {formatMoney(row.total, row.currency)}
                    </strong>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-muted2 sm:grid-cols-5 sm:text-[11px]">
                    <span>Courant {formatMoney(row.current, row.currency)}</span>
                    <span>1–30 {formatMoney(row.d1_30, row.currency)}</span>
                    <span>31–60 {formatMoney(row.d31_60, row.currency)}</span>
                    <span>61–90 {formatMoney(row.d61_90, row.currency)}</span>
                    <span className={row.d90Plus > 0 ? "text-red-700" : ""}>
                      90+ {formatMoney(row.d90Plus, row.currency)}
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted2">Aucune créance ouverte.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Flux de trésorerie du mois</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 sm:px-6">
            {data.monthCurrencies.length ? (
              data.monthCurrencies.map((row) => (
                <div
                  key={row.currency}
                  className="flex flex-col gap-3 rounded-xl border border-line px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="registry-id">{row.currency}</div>
                    <div className="mt-1 text-[11px] leading-4 text-muted2 sm:text-xs">
                      Encaissements nets après frais, remboursements et dépenses
                    </div>
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <div
                      className={`truncate font-semibold ${row.net >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {formatMoney(row.net, row.currency)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted2 sm:text-[11px]">
                      {formatMoney(row.collected, row.currency)} entrées ·{" "}
                      {formatMoney(row.refunds + row.expenses, row.currency)} sorties
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted2">Aucun mouvement ce mois-ci.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="px-4 sm:px-6">
            <CardTitle>Dettes fournisseurs par devise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 sm:px-6">
            {data.expenses.apByCurrency.length ? (
              data.expenses.apByCurrency.map((row) => (
                <Link
                  key={row.currency}
                  href="/app/finance/expenses"
                  className="flex flex-col gap-2 rounded-xl border border-line px-3 py-3 hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="registry-id">{row.currency}</div>
                    <div className="text-[11px] text-muted2 sm:text-xs">
                      {row.count} facture{row.count === 1 ? "" : "s"} fournisseur ouverte
                      {row.count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <div className="truncate font-semibold">{formatMoney(row.outstanding, row.currency)}</div>
                    <div
                      className={`text-[10px] sm:text-[11px] ${row.overdue > 0 ? "text-red-700" : "text-muted2"}`}
                    >
                      {formatMoney(row.overdue, row.currency)} en retard
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted2">Aucune dette fournisseur ouverte.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted2">À traiter</p>
            <h2 className="text-lg font-semibold">Alertes financières</h2>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${alertTotal + arOverdue > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
          >
            {alertTotal + arOverdue} alerte{alertTotal + arOverdue === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid gap-3 sm:gap-4 xl:grid-cols-3">
          <AlertCard
            title="Factures clients en retard"
            count={arOverdue}
            icon={FileText}
            href="/app/finance/invoices"
          >
            {ar.rows
              .filter((r) => r.overdue && r.balance > 0)
              .slice(0, 8)
              .map((r) => (
                <AlertRow
                  key={r.invoice.id}
                  href={`/app/finance/invoices/${r.invoice.id}`}
                  primary={r.invoice.invoiceNumber}
                  secondary={`Échéance ${formatDate(new Date(r.invoice.dueDate))}`}
                  trailing={formatMoney(r.balance, r.invoice.currency)}
                />
              ))}
          </AlertCard>
          <AlertCard
            title="Écarts budgétaires"
            count={data.alerts.counts.budgetVariance}
            icon={Target}
            href="/app/finance/budgeting"
          >
            {data.alerts.budgetVariance.map(({ plan, alert }) => (
              <AlertRow
                key={`${plan.id}-${alert.category}`}
                href={`/app/finance/budgeting/${plan.id}`}
                primary={`${plan.currency} · ${alert.label}`}
                secondary={alert.status.replaceAll("_", " ")}
                trailing={formatMoney(alert.favorableVariance, plan.currency)}
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Paiements à confirmer"
            count={data.alerts.counts.pendingPayments}
            icon={Clock3}
            href="/app/finance/payments"
          >
            {data.alerts.pendingPayments.map((p) => (
              <AlertRow
                key={p.id}
                href={`/app/finance/payments/${p.id}`}
                primary={p.reference}
                secondary={`${p.client.firstName} ${p.client.lastName}`}
                trailing={formatMoney(Number(p.amount), p.currency)}
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Confirmés sans preuve"
            count={data.alerts.counts.missingPaymentProof}
            icon={ReceiptText}
            href="/app/finance/payments"
          >
            {data.alerts.missingPaymentProof.map((p) => (
              <AlertRow
                key={p.id}
                href={`/app/finance/payments/${p.id}`}
                primary={p.reference}
                secondary={`${p.client.firstName} ${p.client.lastName}`}
                trailing="Joindre preuve"
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Factures fournisseurs en retard"
            count={data.alerts.counts.expenseOverdue}
            icon={CircleDollarSign}
            href="/app/finance/expenses"
          >
            {data.alerts.expenseOverdue.map((e) => (
              <AlertRow
                key={e.id}
                href={`/app/finance/expenses/${e.id}`}
                primary={e.expenseNumber}
                secondary={`${e.vendorName} · échéance ${e.dueDate ? formatDate(new Date(e.dueDate)) : "—"}`}
                trailing={formatMoney(expenseRemaining(e), e.currency)}
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Remboursements à réviser"
            count={data.alerts.counts.refundsToReview}
            icon={RefreshCw}
            href="/app/finance/refunds"
          >
            {data.alerts.refundsToReview.map((r) => (
              <AlertRow
                key={r.id}
                href={`/app/finance/refunds/${r.id}`}
                primary={r.refundNumber}
                secondary={`${r.client.firstName} ${r.client.lastName}`}
                trailing={r.status.replaceAll("_", " ")}
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Échéances remboursement en retard"
            count={data.alerts.counts.overdueInstallments}
            icon={AlertTriangle}
            href="/app/finance/refunds"
          >
            {data.alerts.overdueInstallments.map(({ refund, installment }) => (
              <AlertRow
                key={installment.id}
                href={`/app/finance/refunds/${refund.id}`}
                primary={`${refund.refundNumber} · #${installment.number}`}
                secondary={`Échéance ${formatDate(installment.dueDate)}`}
                trailing={formatMoney(Number(installment.amount), refund.currency)}
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Exceptions paiement en ligne"
            count={data.alerts.counts.onlineAttention}
            icon={WalletCards}
            href="/app/finance/online-payments"
          >
            {data.alerts.onlineAttention.map((s) => (
              <AlertRow
                key={s.id}
                href={`/app/finance/online-payments/${s.id}`}
                primary={s.provider.replaceAll("_", " ")}
                secondary={s.clientName}
                trailing={s.status}
              />
            ))}
          </AlertCard>
          <AlertCard
            title="Transferts manuels ouverts"
            count={data.alerts.counts.manualOpen}
            icon={Banknote}
            href="/app/finance/manual-transfers"
          >
            {data.alerts.manualOpen.map((o) => (
              <AlertRow
                key={o.id}
                href={`/app/finance/manual-transfers/${o.id}`}
                primary={o.orderNumber}
                secondary={`${o.originCountry} → ${o.destinationCountry}`}
                trailing={o.status}
              />
            ))}
          </AlertCard>
        </div>
      </div>

      <Card>
        <CardHeader className="px-4 sm:px-6">
          <CardTitle>Prochaines échéances de remboursement</CardTitle>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {data.upcomingInstallments.length ? (
            <div className="divide-y divide-line rounded-xl border border-line">
              {data.upcomingInstallments.map(({ refund, installment }) => (
                <Link
                  key={installment.id}
                  href={`/app/finance/refunds/${refund.id}`}
                  className="flex flex-col gap-1.5 px-3.5 py-3 hover:bg-surface sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4"
                >
                  <div className="min-w-0">
                    <div className="registry-id truncate text-xs sm:text-sm">
                      {refund.refundNumber} · échéance {installment.number}
                    </div>
                    <div className="truncate text-[11px] text-muted2 sm:text-xs">
                      {refund.client.firstName} {refund.client.lastName} · {formatDate(installment.dueDate)}
                    </div>
                  </div>
                  <div className="truncate text-sm font-medium sm:shrink-0">
                    {formatMoney(Number(installment.amount), refund.currency)}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted2">Aucune échéance à venir.</p>
          )}
        </CardContent>
      </Card>
      <p className="text-[10px] leading-4 text-muted2 sm:text-[11px]">
        Mis à jour {formatDateTime(data.generatedAt)}. Les montants ne sont jamais additionnés entre devises.
      </p>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  emphasis = false,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 shadow-sm sm:p-4 ${emphasis ? "border-amber-200 bg-amber-50/70" : "border-line bg-white"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9 ${emphasis ? "bg-amber-100 text-amber-700" : "bg-electric/10 text-electric"}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="truncate text-xl font-semibold sm:text-2xl">{value}</div>
      </div>
      <div className="mt-2.5 truncate text-[11px] font-medium text-ink sm:mt-3 sm:text-xs">{label}</div>
      <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted2 sm:text-[11px]">{hint}</div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white/70 p-2">
      <div className="truncate text-[9px] text-muted2 sm:text-[10px]">{label}</div>
      <div className="mt-0.5 truncate text-[11px] font-medium sm:text-xs">{value}</div>
    </div>
  );
}
function AlertCard({
  title,
  count,
  icon: Icon,
  href,
  children,
}: {
  title: string;
  count: number;
  icon: typeof AlertTriangle;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle>
          <span className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span className="leading-5">{title}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${count ? "bg-amber-50 text-amber-700" : "bg-surface text-muted2"}`}
            >
              {count}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 sm:px-6">
        {count ? children : <p className="text-xs text-muted2">Aucun élément.</p>}
        <Link href={href} className="inline-block pt-1 text-xs font-medium text-electric">
          Ouvrir le module →
        </Link>
      </CardContent>
    </Card>
  );
}
function AlertRow({
  href,
  primary,
  secondary,
  trailing,
}: {
  href: string;
  primary: string;
  secondary: string;
  trailing: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-1 rounded-xl border border-line px-3 py-2.5 hover:bg-surface sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{primary}</div>
        <div className="truncate text-[11px] text-muted2">{secondary}</div>
      </div>
      <div className="truncate text-[11px] font-medium sm:shrink-0">{trailing}</div>
    </Link>
  );
}
