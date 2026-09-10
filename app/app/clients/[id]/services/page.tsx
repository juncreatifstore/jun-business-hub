import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientServiceSummaries } from "@/lib/client-service-summary";
import { getClientBlock } from "@/lib/client-transaction-block";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";
import { BriefcaseBusiness, CircleDollarSign, FileText, ReceiptText, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

function sumCurrency(
  rows: Array<{ currencies: Array<{ currency: string; [key: string]: number | string | null }> }>,
  key: string,
) {
  const map = new Map<string, number>();
  for (const row of rows)
    for (const c of row.currencies)
      map.set(c.currency, Math.round(((map.get(c.currency) || 0) + Number(c[key] || 0)) * 100) / 100);
  return (
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, value]) => formatMoney(value, currency))
      .join(" · ") || formatMoney(0, "USD")
  );
}

export default async function ClientServicesPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await requirePermission("CLIENT_READ");
  const { id } = await Promise.resolve(params);
  const [client, services, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        internalId: true,
        status: true,
        email: true,
        phone: true,
        whatsapp: true,
        country: true,
        createdAt: true,
        tags: { select: { id: true, tag: true } },
      },
    }),
    getClientServiceSummaries(id),
    getClientBlock(id),
  ]);
  if (!client) notFound();

  const blocked = Boolean(block?.blocked);
  const archived = client.status === "ARCHIVED";
  const active = services.filter((s) => !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(s.status));
  const totalProfit = sumCurrency(services, "profit");
  const totalReceived = sumCurrency(services, "netReceived");
  const totalCost = sumCurrency(services, "actualCost");

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        blocked={blocked}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={!blocked && !archived}
        paymentsAllowed={!archived}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-2">Services</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Prestations & dossiers</h2>
          <p className="mt-1 text-sm text-ink-3">
            Vue opérationnelle et financière de chaque prestation gérée pour ce client.
          </p>
        </div>
        {!blocked && !archived ? (
          <Link href={`/app/cases/new?clientId=${client.id}`}>
            <Button variant="primary">Nouvelle prestation</Button>
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={BriefcaseBusiness}
          label="Services actifs"
          value={String(active.length)}
          hint={`${services.length} dossier(s) au total`}
          tone="blue"
        />
        <Metric
          icon={WalletCards}
          label="Net reçu"
          value={totalReceived}
          hint="Après frais de transfert / traitement"
          tone="green"
        />
        <Metric
          icon={ReceiptText}
          label="Coût réel"
          value={totalCost}
          hint="Dépenses réellement payées par JUN"
          tone="amber"
        />
        <Metric
          icon={CircleDollarSign}
          label="Profit / perte"
          value={totalProfit}
          hint="Net reçu moins coûts réels"
          tone="violet"
        />
      </div>

      {services.length === 0 ? (
        <Card className="bg-surface-1">
          <CardContent className="p-8 text-center">
            <BriefcaseBusiness className="mx-auto h-8 w-8 text-ink-2" />
            <p className="mt-3 text-sm text-ink-3">
              Aucune prestation ou dossier n’a encore été créé pour ce client.
            </p>
            {!blocked && !archived ? (
              <Link href={`/app/cases/new?clientId=${client.id}`} className="mt-4 inline-block">
                <Button variant="primary">Créer la première prestation</Button>
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {services.map((service) => (
            <Card key={service.caseId} className="overflow-hidden bg-surface-1">
              <CardHeader className="bg-ink/[0.012]">
                <div className="flex w-full flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/app/cases/${service.caseId}`}
                        className="text-lg font-semibold text-ink hover:text-accent"
                      >
                        {service.title}
                      </Link>
                      <StatusBadge status={service.status} />
                    </div>
                    <p className="registry-id mt-1 text-ink-2">
                      {service.caseNumber} · {service.type}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/app/finance/invoices/new?clientId=${client.id}&caseId=${service.caseId}`}>
                      <Button size="sm" variant="outline">
                        Facture
                      </Button>
                    </Link>
                    <Link href={`/app/finance/expenses/new?clientId=${client.id}&caseId=${service.caseId}`}>
                      <Button size="sm" variant="outline">
                        Dépense
                      </Button>
                    </Link>
                    <Link href={`/app/cases/${service.caseId}`}>
                      <Button size="sm" variant="primary">
                        Ouvrir
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <Info label="Responsable" value={service.ownerName || "Non assigné"} />
                  <Info label="Priorité" value={service.priority.replaceAll("_", " ")} />
                  <Info label="Échéance" value={service.dueDate ? formatDate(service.dueDate) : "—"} />
                  <Info label="Tâches ouvertes" value={String(service.openTasks)} />
                  <Info label="Documents" value={String(service.documentCount)} />
                </div>
                {service.currencies.length === 0 ? (
                  <div className="rounded-xl border border-line bg-ink/[0.018] p-4 text-sm text-ink-3">
                    Aucune activité financière liée à cette prestation.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-ink/[0.025] text-left text-[10px] uppercase tracking-[0.12em] text-ink-2">
                        <tr>
                          <th className="px-3 py-3">Devise</th>
                          <th className="px-3 py-3">Facturé</th>
                          <th className="px-3 py-3">Facture payée</th>
                          <th className="px-3 py-3">Net reçu</th>
                          <th className="px-3 py-3">Frais</th>
                          <th className="px-3 py-3">Coût réel</th>
                          <th className="px-3 py-3">Coût engagé</th>
                          <th className="px-3 py-3">Profit / perte</th>
                          <th className="px-3 py-3">Marge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {service.currencies.map((c) => (
                          <tr
                            key={c.currency}
                            className="border-t border-line transition hover:bg-ink/[0.02]"
                          >
                            <td className="px-3 py-3 font-medium text-ink">{c.currency}</td>
                            <td className="px-3 py-3">{formatMoney(c.billed, c.currency)}</td>
                            <td className="px-3 py-3">{formatMoney(c.invoicePaid, c.currency)}</td>
                            <td className="px-3 py-3 font-medium">
                              {formatMoney(c.netReceived, c.currency)}
                            </td>
                            <td className="px-3 py-3 text-ink-3">
                              {formatMoney(c.transferFees, c.currency)}
                            </td>
                            <td className="px-3 py-3">{formatMoney(c.actualCost, c.currency)}</td>
                            <td className="px-3 py-3 text-ink-3">
                              {formatMoney(c.committedCost, c.currency)}
                            </td>
                            <td
                              className={`px-3 py-3 font-semibold ${c.profit < 0 ? "text-danger" : c.profit > 0 ? "text-success" : ""}`}
                            >
                              {formatMoney(c.profit, c.currency)}
                            </td>
                            <td className="px-3 py-3">
                              {c.marginPercent == null ? "—" : `${c.marginPercent.toFixed(2)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-ink-2">
                  <span>
                    <FileText className="mr-1 inline h-3.5 w-3.5" />
                    {service.invoiceCount} facture(s)
                  </span>
                  <span>
                    <WalletCards className="mr-1 inline h-3.5 w-3.5" />
                    {service.paymentCount} paiement(s)
                  </span>
                  <span>
                    <ReceiptText className="mr-1 inline h-3.5 w-3.5" />
                    {service.expenseCount} dépense(s)
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "green" | "amber" | "violet";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-accent",
    green: "bg-emerald-500/10 text-success",
    amber: "bg-amber-500/10 text-warning",
    violet: "bg-violet-500/10 text-violet-400",
  };
  return (
    <Card className="bg-surface-1">
      <CardContent className="p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="mt-3 text-xs text-ink-3">{label}</p>
        <p className="mt-1 break-words text-lg font-semibold text-ink">{value}</p>
        <p className="mt-1 text-[11px] text-ink-2">{hint}</p>
      </CardContent>
    </Card>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-ink/[0.015] p-3">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 font-medium text-ink">{value}</div>
    </div>
  );
}
