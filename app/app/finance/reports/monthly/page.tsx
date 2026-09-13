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
  const r = await buildMonthlyReport(sp.month);
  const prev = monthKey(new Date(Date.UTC(r.start.getUTCFullYear(), r.start.getUTCMonth() - 1, 1)));
  const next = monthKey(new Date(Date.UTC(r.start.getUTCFullYear(), r.start.getUTCMonth() + 1, 1)));
  const label = r.start.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
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
        <ArrowLeft className="h-3.5 w-3.5" /> Rapports
      </Link>
      <PageHeader
        eyebrow="Finance"
        title={`Rapport mensuel — ${label}`}
        subtitle="Encaissements confirmés, remboursements versés, dépenses payées, demandes clients et résultat net par devise. Les devises ne sont jamais additionnées."
        actions={
          <div className="flex items-center gap-2">
            <Link
              prefetch={false}
              href={`/app/finance/reports/monthly?month=${prev}`}
              className="rounded-lg border border-line p-2 hover:bg-surface"
              title="Mois précédent"
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
                Voir
              </button>
            </form>
            <Link
              prefetch={false}
              href={`/app/finance/reports/monthly?month=${next}`}
              className="rounded-lg border border-line p-2 hover:bg-surface"
              title="Mois suivant"
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
            <CardTitle className="text-sm">Encaissements confirmés</CardTitle>
          </CardHeader>
          <CardContent>
            <Lines lines={r.paymentsConfirmed} empty="Aucun encaissement confirmé" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Remboursements versés</CardTitle>
          </CardHeader>
          <CardContent>
            <Lines lines={r.refundsPaid} empty="Aucun versement" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dépenses payées</CardTitle>
          </CardHeader>
          <CardContent>
            <Lines lines={r.expenses} empty="Aucune dépense payée" />
          </CardContent>
        </Card>
        <Card className="border-electric/30">
          <CardHeader>
            <CardTitle className="text-sm">Résultat net (encaissé − remboursé − dépensé)</CardTitle>
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
            <CardTitle className="text-sm">Encaissements par moyen de paiement</CardTitle>
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
            <CardTitle className="text-sm">Top clients du mois</CardTitle>
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
            <CardTitle className="text-sm">Demandes de remboursement</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted2">Soumises</div>
              <div className="text-lg font-semibold">{r.claims.submitted}</div>
            </div>
            <div>
              <div className="text-xs text-muted2">Acceptées / refusées</div>
              <div className="text-lg font-semibold">
                {r.claims.converted} / {r.claims.rejected}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">Partielles · retenues</div>
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
              <div className="text-xs text-muted2">Délai moyen de décision</div>
              <div className="text-lg font-semibold">
                {r.claims.avgDecisionDays === null ? "—" : `${r.claims.avgDecisionDays.toFixed(1)} j`}
              </div>
            </div>
            <div className="col-span-2 border-t border-line pt-2">
              <div className="text-xs text-muted2">Remboursements approuvés dans le mois</div>
              <Lines lines={r.refundsApproved} empty="—" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Demandes de paiement & encours</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted2">Envoyées / payées</div>
              <div className="text-lg font-semibold">
                {r.paymentRequests.sent} / {r.paymentRequests.paid}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">Ouvertes · en retard</div>
              <div className="text-lg font-semibold">
                {r.paymentRequests.open}{" "}
                <span
                  className={`text-xs font-normal ${r.paymentRequests.overdue ? "text-red-700" : "text-muted2"}`}
                >
                  ({r.paymentRequests.overdue} en retard)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">Délai preuve → confirmation</div>
              <div className="text-lg font-semibold">
                {r.paymentRequests.avgConfirmDays === null
                  ? "—"
                  : `${r.paymentRequests.avgConfirmDays.toFixed(1)} j`}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted2">Paiements créés en attente</div>
              <Lines lines={r.paymentsPending} empty="—" />
            </div>
          </CardContent>
        </Card>
      </div>

      {r.daily.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Encaissements par jour</CardTitle>
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
