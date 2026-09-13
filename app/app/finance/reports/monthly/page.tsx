import { tr } from "@/lib/i18n-server";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildMonthlyReport, monthKey } from "@/lib/finance-monthly";
import { ArrowLeft, Download, ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = {
  ZELLE: "Zelle",
  STRIPE: "Carte (Stripe)",
  PAYPAL: "PayPal",
  MERCADO_PAGO: "Mercado Pago",
  BANK_TRANSFER: "Virement",
  CASH: "Espèces",
  MONCASH: "MonCash",
  OTHER: "Autre",
};
const money = (n: number, c: string) =>
  `${c} ${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function MonthlyReportPage(props: { searchParams: Promise<{ month?: string }> }) {
  const sp = await props.searchParams;
  await requirePermission("PAYMENT_READ");
  const t = await tr();
  const r = await buildMonthlyReport(sp.month);
  const prev = monthKey(new Date(Date.UTC(r.start.getUTCFullYear(), r.start.getUTCMonth() - 1, 1)));
  const next = monthKey(new Date(Date.UTC(r.start.getUTCFullYear(), r.start.getUTCMonth() + 1, 1)));
  const label = r.start.toLocaleDateString(t("fr-FR", "en-US"), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const Lines = ({
    lines,
    empty,
  }: {
    lines: Array<{ currency: string; count: number; total: number }>;
    empty: string;
  }) =>
    lines.length ? (
      <ul className="space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.currency} className="flex justify-between">
            <span className="text-muted2">
              {l.count} opération{l.count > 1 ? "s" : ""}
            </span>
            <span className="font-semibold">{money(l.total, l.currency)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted2">{empty}</p>
    );

  return (
    <div className="space-y-5">
      <Link
        prefetch={false}
        href="/app/finance/reports"
        className="inline-flex items-center gap-1 text-xs text-muted2 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t(t("Rapports", "Reports"), "Reports")}
      </Link>
      <PageHeader
        eyebrow="Finance"
        title={`${t("Rapport mensuel", "Monthly report")} — ${label}`}
        subtitle={t(
          t(
            "Encaissements confirmés, remboursements versés, dépenses payées, demandes clients et résultat net par devise. Les devises ne sont jamais additionnées.",
            "Confirmed inflows, refunds paid, expenses paid, client requests and net result per currency. Currencies are never added together.",
          ),
          "Confirmed inflows, refunds paid, expenses paid, client requests and net result per currency. Currencies are never added together.",
        )}
        actions={
          <div className="flex items-center gap-2">
            <Link
              prefetch={false}
              href={`/app/finance/reports/monthly?month=${prev}`}
              className="rounded-lg border border-line p-2 hover:bg-surface"
              title={t(t("Mois précédent", "Previous month"), "Previous month")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <form method="get" className="flex items-center gap-2">
              <input
                type="month"
                name="month"
                defaultValue={r.key}
                className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
              />
              <button className="h-9 rounded-lg border border-line px-3 text-sm hover:bg-surface">
                {t(t("Voir", "View"), "View")}
              </button>
            </form>
            <Link
              prefetch={false}
              href={`/app/finance/reports/monthly?month=${next}`}
              className="rounded-lg border border-line p-2 hover:bg-surface"
              title={t(t("Mois suivant", "Next month"), "Next month")}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href={`/api/finance/monthly.csv?month=${r.key}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-electric px-3 text-sm font-medium text-white"
            >
              <Download className="h-4 w-4" /> CSV
            </a>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(t("Encaissements confirmés", "Confirmed inflows"), "Confirmed inflows")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Lines
              lines={r.paymentsConfirmed}
              empty={t(t("Aucun encaissement confirmé", "No confirmed inflow"), "No confirmed inflow")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(t("Remboursements versés", "Refunds paid"), "Refunds paid")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Lines lines={r.refundsPaid} empty={t(t("Aucun versement", "No payout"), "No payout")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(t("Dépenses payées", "Expenses paid"), "Expenses paid")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Lines
              lines={r.expenses}
              empty={t(t("Aucune dépense payée", "No expense paid"), "No expense paid")}
            />
          </CardContent>
        </Card>
        <Card className="border-electric/30">
          <CardHeader>
            <CardTitle className="text-sm">
              {t(
                t(
                  "Résultat net (encaissé − remboursé − dépensé)",
                  "Net result (inflows − refunds − expenses)",
                ),
                "Net result (inflows − refunds − expenses)",
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.net.length ? (
              <ul className="space-y-1 text-sm">
                {r.net.map((l) => (
                  <li key={l.currency} className="flex justify-between">
                    <span className="text-muted2">{l.currency}</span>
                    <span className={`font-semibold ${l.net < 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {money(l.net, l.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted2">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(
                t("Encaissements par moyen de paiement", "Inflows by payment method"),
                "Inflows by payment method",
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.paymentsByMethod.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {r.paymentsByMethod.map((m) => (
                    <tr key={`${m.method}-${m.currency}`}>
                      <td className="py-1.5">{METHOD[m.method] ?? m.method}</td>
                      <td className="py-1.5 text-muted2">{m.count}</td>
                      <td className="py-1.5 text-right font-medium">{money(m.total, m.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted2">—</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(t("Top clients du mois", "Top clients this month"), "Top clients this month")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {r.topClients.length ? (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {r.topClients.map((c) => (
                    <tr key={`${c.client}-${c.currency}`}>
                      <td className="py-1.5">{c.client}</td>
                      <td className="py-1.5 text-right font-medium">{money(c.total, c.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted2">—</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(t("Demandes de remboursement", "Refund claims"), "Refund claims")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted2">{t(t("Soumises", "Submitted"), "Submitted")}</div>
              <div className="text-lg font-semibold">{r.claims.submitted}</div>
            </div>
            <div>
              <div className="text-xs text-muted2">
                {t(t("Acceptées / refusées", "Accepted / declined"), "Accepted / declined")}
              </div>
              <div className="text-lg font-semibold">
                {r.claims.converted} / {r.claims.rejected}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">
                {t(t("Partielles · retenues", "Partial · retained"), "Partial · retained")}
              </div>
              <div className="text-lg font-semibold">
                {r.claims.partial}
                {r.claims.retained.length ? (
                  <span className="ml-2 text-xs font-normal text-muted2">
                    {r.claims.retained.map((x) => money(x.total, x.currency)).join(" · ")}
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">
                {t(t("Délai moyen de décision", "Average decision time"), "Average decision time")}
              </div>
              <div className="text-lg font-semibold">
                {r.claims.avgDecisionDays === null ? "—" : `${r.claims.avgDecisionDays.toFixed(1)} j`}
              </div>
            </div>
            <div className="col-span-2 border-t border-line pt-2">
              <div className="text-xs text-muted2">
                {t(
                  t("Remboursements approuvés dans le mois", "Refunds approved this month"),
                  "Refunds approved this month",
                )}
              </div>
              <Lines lines={r.refundsApproved} empty="—" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(
                t("Demandes de paiement & encours", "Payment requests & outstanding"),
                "Payment requests & outstanding",
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted2">
                {t(t("Envoyées / payées", "Sent / paid"), "Sent / paid")}
              </div>
              <div className="text-lg font-semibold">
                {r.paymentRequests.sent} / {r.paymentRequests.paid}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">
                {t(t("Ouvertes · en retard", "Open · overdue"), "Open · overdue")}
              </div>
              <div className="text-lg font-semibold">
                {r.paymentRequests.open}{" "}
                <span
                  className={`text-xs font-normal ${r.paymentRequests.overdue ? "text-red-700" : "text-muted2"}`}
                >
                  ({r.paymentRequests.overdue} {t("en retard", "overdue")})
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">
                {t(
                  t("Délai preuve → confirmation", "Proof → confirmation time"),
                  "Proof → confirmation time",
                )}
              </div>
              <div className="text-lg font-semibold">
                {r.paymentRequests.avgConfirmDays === null
                  ? "—"
                  : `${r.paymentRequests.avgConfirmDays.toFixed(1)} j`}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">
                {t(t("Paiements créés en attente", "Payments created, pending"), "Payments created, pending")}
              </div>
              <Lines lines={r.paymentsPending} empty="—" />
            </div>
          </CardContent>
        </Card>
      </div>

      {r.daily.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {t(t("Encaissements par jour", "Inflows per day"), "Inflows per day")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {(() => {
                const max = Math.max(...r.daily.map((d) => d.total), 1);
                return r.daily.map((d) => (
                  <div
                    key={`${d.day}-${d.currency}`}
                    className="group relative flex-1"
                    title={`${d.day} · ${money(d.total, d.currency)}`}
                  >
                    <div
                      className="w-full rounded-t bg-electric/70 group-hover:bg-electric"
                      style={{ height: `${Math.max(4, (d.total / max) * 100)}%` }}
                    />
                  </div>
                ));
              })()}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted2">
              <span>{r.daily[0]?.day}</span>
              <span>{r.daily[r.daily.length - 1]?.day}</span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
