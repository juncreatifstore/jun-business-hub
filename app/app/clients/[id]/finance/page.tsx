import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { getClientBlock } from "@/lib/client-transaction-block";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";
import { AlertTriangle, Banknote, CircleDollarSign, ReceiptText, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientFinancePage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await requirePermission("CLIENT_READ");
  const { id } = await Promise.resolve(params);
  const [client, finance, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        internalId: true,
        firstName: true,
        lastName: true,
        status: true,
        email: true,
        phone: true,
        whatsapp: true,
        country: true,
        createdAt: true,
        tags: { select: { id: true, tag: true } },
      },
    }),
    getClientFinanceOverview(id),
    getClientBlock(id),
  ]);
  if (!client) notFound();

  const blocked = Boolean(block?.blocked);
  const archived = client.status === "ARCHIVED";
  const hasDebt = finance.summaries.some((s) => s.forecastProfit < -0.009);
  const alertCount =
    finance.alerts.overallocatedPayments.length +
    finance.alerts.overdueInvoices.length +
    finance.alerts.pendingPayments.length +
    finance.alerts.pendingRefunds.length +
    finance.alerts.pendingExpenses.length;

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        blocked={blocked}
        hasDebt={hasDebt}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={!blocked && !archived && !hasDebt}
        paymentsAllowed={!archived}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Finance</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Position financière du client</h2>
          <p className="mt-1 text-sm text-slate-500">
            Factures, paiements, frais, dépenses, soldes, rentabilité et remboursements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/finance/expenses/new?clientId=${id}`}>
            <Button variant="outline">Nouvelle dépense</Button>
          </Link>
          <Link href={`/app/finance/invoices/new?clientId=${id}`}>
            <Button variant="primary">Nouvelle facture</Button>
          </Link>
        </div>
      </div>

      {finance.summaries.length === 0 ? (
        <Card className="bg-[#0e1624]">
          <CardContent className="p-6 text-center text-sm text-slate-500">
            Aucune activité financière enregistrée pour ce client.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {finance.summaries.map((s) => (
            <Card key={s.currency} className="bg-[#0e1624]">
              <CardHeader>
                <div className="flex w-full items-center justify-between gap-3">
                  <div>
                    <CardTitle>Position {s.currency}</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">Base nette après frais et engagements</p>
                  </div>
                  <Badge className="border border-blue-500/15 bg-blue-500/[0.07] text-blue-400">
                    NET BASIS
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                  <Metric
                    icon={CircleDollarSign}
                    label="Brut envoyé"
                    value={formatMoney(s.grossReceived, s.currency)}
                  />
                  <Metric
                    icon={Banknote}
                    label="Frais de transfert"
                    value={`-${formatMoney(s.fees, s.currency)}`}
                  />
                  <Metric
                    icon={WalletCards}
                    label="Net reçu"
                    value={formatMoney(s.netReceived, s.currency)}
                  />
                  <Metric
                    icon={ReceiptText}
                    label="Dépenses payées"
                    value={`-${formatMoney(s.expensePaid, s.currency)}`}
                  />
                  <Metric
                    icon={ReceiptText}
                    label="Coûts engagés"
                    value={formatMoney(s.expenseCommitted, s.currency)}
                  />
                  <Metric
                    icon={CircleDollarSign}
                    label="Profit réalisé"
                    value={formatMoney(s.realizedProfit, s.currency)}
                  />
                  <Metric
                    icon={CircleDollarSign}
                    label="Profit prévisionnel"
                    value={formatMoney(s.forecastProfit, s.currency)}
                  />
                  <Metric
                    icon={AlertTriangle}
                    label="À recevoir"
                    value={formatMoney(s.receivable, s.currency)}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.055] pt-3 text-xs text-slate-500">
                  <span>
                    Facturé: <strong className="text-slate-200">{formatMoney(s.billed, s.currency)}</strong>
                  </span>
                  <span>
                    Factures payées:{" "}
                    <strong className="text-slate-200">{formatMoney(s.invoicePaid, s.currency)}</strong>
                  </span>
                  <span>
                    Appliqué:{" "}
                    <strong className="text-slate-200">{formatMoney(s.appliedToInvoices, s.currency)}</strong>
                  </span>
                  <span>
                    Non appliqué:{" "}
                    <strong className="text-slate-200">{formatMoney(s.unappliedFunds, s.currency)}</strong>
                  </span>
                  <span>
                    Dépenses en attente:{" "}
                    <strong className="text-slate-200">
                      {formatMoney(s.expensePendingApproval, s.currency)}
                    </strong>
                  </span>
                  <span>
                    Coûts approuvés restants:{" "}
                    <strong className="text-slate-200">{formatMoney(s.expenseRemaining, s.currency)}</strong>
                  </span>
                  <span>
                    Remboursements approuvés:{" "}
                    <strong className="text-slate-200">{formatMoney(s.approvedRefunds, s.currency)}</strong>
                  </span>
                  <span>
                    Remboursements payés:{" "}
                    <strong className="text-slate-200">{formatMoney(s.refundPaid, s.currency)}</strong>
                  </span>
                  <span>
                    Marge réalisée:{" "}
                    <strong className="text-slate-200">
                      {s.realizedMarginPercent == null ? "—" : `${s.realizedMarginPercent.toFixed(2)}%`}
                    </strong>
                  </span>
                  <span>
                    Marge prévisionnelle:{" "}
                    <strong className="text-slate-200">
                      {s.forecastMarginPercent == null ? "—" : `${s.forecastMarginPercent.toFixed(2)}%`}
                    </strong>
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {alertCount > 0 ? (
        <Card className="bg-[#0e1624]">
          <CardHeader>
            <CardTitle>Points d’attention finance</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <AlertBox
              title="Paiements suralloués"
              count={finance.alerts.overallocatedPayments.length}
              text="Les allocations dépassent le net disponible."
            />
            <AlertBox
              title="Factures échues"
              count={finance.alerts.overdueInvoices.length}
              text="Des factures conservent un solde après échéance."
            />
            <AlertBox
              title="Paiements en attente"
              count={finance.alerts.pendingPayments.length}
              text="Des paiements nécessitent encore confirmation."
            />
            <AlertBox
              title="Dépenses en attente"
              count={finance.alerts.pendingExpenses.length}
              text="Des dépenses attendent approbation ou traitement."
            />
            <AlertBox
              title="Remboursements en attente"
              count={finance.alerts.pendingRefunds.length}
              text="Des demandes attendent une décision."
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-[#0e1624]">
        <CardHeader>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <CardTitle>Factures</CardTitle>
            <Link
              href={`/app/finance/invoices/new?clientId=${id}`}
              className="text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Créer une facture
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {finance.invoices.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Aucune facture pour ce client.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Facture</TH>
                    <TH>Service</TH>
                    <TH>Total</TH>
                    <TH>Payé</TH>
                    <TH>Solde</TH>
                    <TH>Statut</TH>
                    <TH>Échéance</TH>
                  </tr>
                </THead>
                <tbody>
                  {finance.invoices.map(({ invoice, state }) => (
                    <TR key={invoice.id}>
                      <TD>
                        <Link
                          className="registry-id hover:text-electric"
                          href={`/app/finance/invoices/${invoice.id}`}
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </TD>
                      <TD>
                        <div className="font-medium">{invoice.title}</div>
                        {invoice.caseId ? (
                          <Link
                            href={`/app/cases/${invoice.caseId}`}
                            className="text-xs text-electric hover:underline"
                          >
                            Ouvrir le dossier
                          </Link>
                        ) : (
                          <div className="text-xs text-muted2">Aucun dossier lié</div>
                        )}
                      </TD>
                      <TD className="font-medium">{formatMoney(invoice.total, invoice.currency)}</TD>
                      <TD className="text-emerald-700">{formatMoney(state.paid, invoice.currency)}</TD>
                      <TD
                        className={
                          state.balance > 0 ? "font-medium text-amber-700" : "font-medium text-emerald-700"
                        }
                      >
                        {formatMoney(state.balance, invoice.currency)}
                      </TD>
                      <TD>
                        <StatusBadge status={state.effectiveStatus} />
                      </TD>
                      <TD className="text-muted2">{formatDate(new Date(invoice.dueDate))}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#0e1624]">
        <CardHeader>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <CardTitle>Paiements</CardTitle>
            <Link
              href={`/app/finance/payments/new?clientId=${id}`}
              className="text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Enregistrer paiement
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {finance.payments.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Aucun paiement enregistré.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Référence</TH>
                    <TH>Brut</TH>
                    <TH>Frais</TH>
                    <TH>Net reçu</TH>
                    <TH>Appliqué</TH>
                    <TH>Non appliqué</TH>
                    <TH>Statut</TH>
                    <TH>Date</TH>
                  </tr>
                </THead>
                <tbody>
                  {finance.payments.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <Link
                          className="registry-id hover:text-electric"
                          href={`/app/finance/payments/${p.id}`}
                        >
                          {p.reference}
                        </Link>
                        <div className="mt-1 text-xs text-muted2">
                          {p.serviceLabel || p.method.replaceAll("_", " ")}
                        </div>
                      </TD>
                      <TD>{formatMoney(p.gross, p.currency)}</TD>
                      <TD className={p.fee > 0 ? "text-red-700" : "text-muted2"}>
                        {p.fee > 0 ? `-${formatMoney(p.fee, p.currency)}` : "—"}
                      </TD>
                      <TD className="font-semibold">{formatMoney(p.net, p.currency)}</TD>
                      <TD>{formatMoney(p.applied, p.currency)}</TD>
                      <TD className={p.unapplied > 0 ? "font-medium text-blue-700" : "text-muted2"}>
                        {formatMoney(p.unapplied, p.currency)}
                        {p.overallocated > 0 ? (
                          <div className="mt-1 text-xs text-red-700">
                            Suralloué de {formatMoney(p.overallocated, p.currency)}
                          </div>
                        ) : null}
                      </TD>
                      <TD>
                        <StatusBadge status={p.status} />
                      </TD>
                      <TD className="text-muted2">{formatDate(p.paidAt || p.createdAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#0e1624]">
        <CardHeader>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <CardTitle>Dépenses</CardTitle>
            <Link
              href={`/app/finance/expenses/new?clientId=${id}`}
              className="text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Enregistrer dépense
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {finance.expenses.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Aucune dépense liée à ce client.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Dépense</TH>
                    <TH>Fournisseur / service</TH>
                    <TH>Montant</TH>
                    <TH>Payé</TH>
                    <TH>Restant</TH>
                    <TH>Statut</TH>
                    <TH>Dossier</TH>
                    <TH>Mise à jour</TH>
                  </tr>
                </THead>
                <tbody>
                  {finance.expenses.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <Link
                          className="registry-id hover:text-electric"
                          href={`/app/finance/expenses/${e.id}`}
                        >
                          {e.expenseNumber}
                        </Link>
                        <div className="mt-1 text-xs text-muted2">{e.category.replaceAll("_", " ")}</div>
                      </TD>
                      <TD>
                        <div className="font-medium">{e.vendorName}</div>
                        <div className="max-w-xs truncate text-xs text-muted2">{e.description}</div>
                      </TD>
                      <TD className="font-medium">{formatMoney(e.amount, e.currency)}</TD>
                      <TD className={e.paidNumber > 0 ? "text-red-700" : "text-muted2"}>
                        {formatMoney(e.paidNumber, e.currency)}
                      </TD>
                      <TD>{formatMoney(e.remainingNumber, e.currency)}</TD>
                      <TD>
                        <StatusBadge status={e.effectiveStatus} />
                      </TD>
                      <TD>
                        {e.caseId ? (
                          <Link href={`/app/cases/${e.caseId}`} className="text-electric hover:underline">
                            {e.caseLabel || "Ouvrir le dossier"}
                          </Link>
                        ) : (
                          <span className="text-amber-700">Aucun dossier lié</span>
                        )}
                      </TD>
                      <TD className="text-muted2">{formatDate(new Date(e.updatedAt))}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#0e1624]">
        <CardHeader>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <CardTitle>Remboursements</CardTitle>
            <Link
              href={`/app/finance/refunds/new?clientId=${id}`}
              className="text-sm font-medium text-blue-400 hover:text-blue-300"
            >
              Nouveau remboursement
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {finance.refunds.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">Aucun remboursement pour ce client.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH>Référence</TH>
                    <TH>Demandé</TH>
                    <TH>Payé</TH>
                    <TH>Restant</TH>
                    <TH>Statut</TH>
                    <TH>Motif</TH>
                    <TH>Créé</TH>
                  </tr>
                </THead>
                <tbody>
                  {finance.refunds.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <Link
                          className="registry-id hover:text-electric"
                          href={`/app/finance/refunds/${r.id}`}
                        >
                          {r.refundNumber}
                        </Link>
                      </TD>
                      <TD>{formatMoney(r.amountNumber, r.currency)}</TD>
                      <TD className="text-red-700">{formatMoney(r.paidNumber, r.currency)}</TD>
                      <TD className="font-medium">{formatMoney(r.remainingNumber, r.currency)}</TD>
                      <TD>
                        <StatusBadge status={r.status} />
                      </TD>
                      <TD className="max-w-xs truncate text-muted2">{r.reason}</TD>
                      <TD className="text-muted2">{formatDate(r.createdAt)}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-[#0e1624]">
        <CardHeader>
          <CardTitle>Règles financières appliquées</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <Rule
            title="Net reçu"
            text="Paiement brut moins frais de transfert. C’est le montant réellement reçu par JUN."
          />
          <Rule
            title="Dépenses"
            text="Toutes les dépenses liées au client apparaissent ici. Les brouillons restent visibles sans devenir un coût engagé avant approbation."
          />
          <Rule
            title="Profit réalisé"
            text="Net reçu moins remboursements déjà payés et dépenses réellement payées par JUN."
          />
          <Rule
            title="Profit prévisionnel"
            text="Net reçu moins remboursements approuvés et dépenses approuvées / engagées."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
      <Icon className="mb-2 h-4 w-4 text-blue-400" />
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-words font-semibold text-slate-200">{value}</div>
    </div>
  );
}
function AlertBox({ title, count, text }: { title: string; count: number; text: string }) {
  return (
    <div
      className={
        count
          ? "rounded-xl border border-amber-400/15 bg-amber-500/[0.06] p-4"
          : "rounded-xl border border-white/[0.055] bg-white/[0.018] p-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-slate-200">{title}</div>
        <Badge
          className={
            count
              ? "border border-amber-400/15 bg-amber-500/10 text-amber-600"
              : "border border-white/[0.06] bg-white/[0.02] text-slate-500"
          }
        >
          {count}
        </Badge>
      </div>
      <div className="mt-1 text-xs text-slate-500">{text}</div>
    </div>
  );
}
function Rule({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/[0.055] bg-white/[0.015] p-4">
      <div className="font-medium text-slate-200">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
    </div>
  );
}
