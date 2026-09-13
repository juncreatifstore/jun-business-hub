import { tr } from "@/lib/i18n-server";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListCount, Pagination, RecordCard, RecordField } from "@/components/ui/record-list";
import { formatDate, formatMoney } from "@/lib/utils";
import { refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { syncOverdueRefundInstallments } from "@/lib/finance-refund-installments";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Inbox,
  Search,
  SearchCheck,
  Undo2,
  WalletCards,
} from "lucide-react";
import { RefundClaimSendPanel } from "@/components/app/refund-claim-send-panel";
import { reasonLabel, refundClaimStats } from "@/lib/refund-claims";

export const dynamic = "force-dynamic";
const STATUSES = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID", "PAID", "REJECTED", "CANCELLED"];
const PAGE_SIZE = 25;
type Params = { q?: string; status?: string; page?: string };

export default async function RefundsPage(props: { searchParams?: Promise<Params> }) {
  const searchParams = await props.searchParams;
  await requirePermission("REFUND_READ");
  const t = await tr();
  await syncOverdueRefundInstallments();
  const params = searchParams ?? {};
  const q = String(params.q || "").trim();
  const status = STATUSES.includes(String(params.status)) ? String(params.status) : "ALL";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where: any = {
    ...(status !== "ALL" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { refundNumber: { contains: q, mode: "insensitive" } },
            { reason: { contains: q, mode: "insensitive" } },
            { client: { firstName: { contains: q, mode: "insensitive" } } },
            { client: { lastName: { contains: q, mode: "insensitive" } } },
            { client: { internalId: { contains: q, mode: "insensitive" } } },
            { payment: { reference: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [claims, claimClients, claimPayments] = await Promise.all([
    prisma.refundClaim.findMany({
      where: { status: { in: ["SENT", "SUBMITTED", "UNDER_REVIEW"] } },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: {
        client: { select: { firstName: true, lastName: true } },
        payment: { select: { reference: true } },
      },
    }),
    prisma.client.findMany({
      where: { archivedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, internalId: true, email: true, phone: true },
      take: 500,
    }),
    prisma.payment.findMany({
      where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, clientId: true, reference: true, amount: true, currency: true },
    }),
  ]);
  const claimStats = await refundClaimStats().catch(() => null);
  const [allRefunds, total] = await Promise.all([
    prisma.refund.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { installments: { orderBy: { dueDate: "asc" } } },
    }),
    prisma.refund.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const refunds = await prisma.refund.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      client: true,
      payment: { select: { reference: true } },
      installments: { orderBy: { dueDate: "asc" } },
      files: { where: { archivedAt: null }, select: { id: true } },
    },
  });
  const review = allRefunds.filter((r) => ["REQUESTED", "UNDER_REVIEW"].includes(r.status)).length;
  const approved = allRefunds.filter((r) => r.status === "APPROVED").length;
  const paying = allRefunds.filter((r) => r.status === "PARTIALLY_PAID").length;
  const completed = allRefunds.filter((r) => r.status === "PAID").length;
  const overdue = allRefunds.reduce(
    (sum, r) => sum + r.installments.filter((i) => i.status === "LATE").length,
    0,
  );
  const activeStatuses = new Set(["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"]);
  const activeByPayment = new Map<string, number>();
  for (const r of allRefunds)
    if (r.paymentId && activeStatuses.has(r.status))
      activeByPayment.set(r.paymentId, (activeByPayment.get(r.paymentId) || 0) + 1);
  const duplicateGroups = [...activeByPayment.values()].filter((count) => count > 1).length;
  const globalBalanceActive = allRefunds.filter((r) => !r.paymentId && activeStatuses.has(r.status)).length;
  const paginationParams = { q: q || undefined, status: status !== "ALL" ? status : undefined };

  return (
    <div>
      <PageHeader
        title={t(t("Remboursements", "Refunds"), "Refunds")}
        subtitle={t(
          t(
            "Workflow contrôlé des demandes, validations, échéanciers, décaissements et rapprochements.",
            "Controlled workflow for requests, approvals, schedules, payouts and reconciliation.",
          ),
          "Controlled workflow for requests, approvals, schedules, payouts and reconciliation.",
        )}
        actionHref="/app/finance/refunds/new"
        actionLabel={t(t("Nouveau remboursement", "New refund"), "New refund")}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={SearchCheck} label={t(t("À réviser", "To review"), "To review")} value={review} />
        <Metric
          icon={Clock3}
          label={t(t("Approuvés / à payer", "Approved / to pay"), "Approved / to pay")}
          value={approved}
        />
        <Metric
          icon={WalletCards}
          label={t(t("Partiellement payés", "Partially paid"), "Partially paid")}
          value={paying}
        />
        <Metric
          icon={AlertTriangle}
          label={t(t("Échéances en retard", "Overdue installments"), "Overdue installments")}
          value={overdue}
        />
        <Metric icon={CheckCircle2} label={t(t("Terminés", "Completed"), "Completed")} value={completed} />
      </div>
      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <Inbox className="h-4 w-4 text-electric" />{" "}
              {t(t("Demandes clients", "Client claims"), "Client claims")}
              <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted2">
                {claims.filter((c) => c.status !== "SENT").length} à traiter ·{" "}
                {claims.filter((c) => c.status === "SENT").length} en attente du client
              </span>
            </div>
          </div>
          {claimStats ? (
            <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-3 text-xs sm:grid-cols-4">
              <div>
                <div className="text-muted2">{t(t("90 derniers jours", "Last 90 days"), "Last 90 days")}</div>
                <div className="text-base font-semibold">
                  {claimStats.total} {t("demandes", "claims")}
                </div>
              </div>
              <div>
                <div className="text-muted2">
                  {t(t("Délai moyen de décision", "Average decision time"), "Average decision time")}
                </div>
                <div className="text-base font-semibold">
                  {claimStats.avgDays === null ? "—" : `${claimStats.avgDays.toFixed(1)} j`}
                </div>
              </div>
              <div>
                <div className="text-muted2">
                  {t(t("Taux d’acceptation", "Acceptance rate"), "Acceptance rate")}
                </div>
                <div className="text-base font-semibold">
                  {claimStats.acceptRate === null ? "—" : `${Math.round(claimStats.acceptRate * 100)} %`}
                  {claimStats.partial ? (
                    <span className="ml-1 text-xs font-normal text-muted2">
                      ({claimStats.partial} {t("partiel", "partial")}
                      {claimStats.partial > 1 ? "s" : ""})
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="text-muted2">
                  {t(t("En retard (SLA 5 j)", "Overdue (5-day SLA)"), "Overdue (5-day SLA)")}
                </div>
                <div className={`text-base font-semibold ${claimStats.overdue ? "text-red-700" : ""}`}>
                  {claimStats.overdue}
                </div>
              </div>
            </div>
          ) : null}
          {claims.length ? (
            <ul className="divide-y divide-line">
              {claims.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      c.status === "SUBMITTED"
                        ? "bg-amber-50 text-amber-800"
                        : c.status === "UNDER_REVIEW"
                          ? "bg-blue-50 text-blue-800"
                          : "bg-surface text-muted2"
                    }`}
                  >
                    {c.status === "SENT"
                      ? t("lien envoyé", "link sent")
                      : c.status === "SUBMITTED"
                        ? t("à examiner", "to review")
                        : t("en examen", "under review")}
                  </span>
                  <Link
                    prefetch={false}
                    href={`/app/finance/refunds/claims/${c.id}`}
                    className="font-medium hover:text-electric"
                  >
                    {c.client.firstName} {c.client.lastName}
                  </Link>
                  <span className="text-muted2">
                    {c.amount
                      ? `${c.currency} ${Number(c.amount).toFixed(2)} · ${reasonLabel(c.reasonCode)}`
                      : t("en attente du formulaire", "waiting for the form")}
                    {c.payment ? ` · ${c.payment.reference}` : ""}
                  </span>
                  <span className="ml-auto text-xs text-muted2">
                    {(c.submittedAt ?? c.createdAt).toLocaleDateString("fr-FR")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted2">
              {t(
                t(
                  "Aucune demande client en cours. Envoyez un formulaire à droite.",
                  "No client claim in progress. Send a form on the right.",
                ),
                "No client claim in progress. Send a form on the right.",
              )}
            </p>
          )}
        </div>
        <RefundClaimSendPanel
          returnTo="/app/finance/refunds"
          clients={claimClients.map((c) => ({
            id: c.id,
            label: `${c.firstName} ${c.lastName} · ${c.internalId}`,
            email: c.email,
            phone: c.phone,
          }))}
          payments={claimPayments.map((p) => ({
            id: p.id,
            clientId: p.clientId,
            label: `${p.reference} · ${p.currency} ${Number(p.amount).toFixed(2)}`,
          }))}
          compact
        />
      </div>
      {duplicateGroups > 0 ? (
        <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-warning">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <div className="font-medium text-warning">Rapprochement à vérifier</div>
              <div className="mt-1 text-amber-200/80">
                {duplicateGroups} paiement(s) d’origine possèdent plusieurs demandes de remboursement actives.
              </div>
              <div className="mt-1 text-xs text-amber-200/55">
                Les demandes annulées ou rejetées ne sont pas comptées comme doublons actifs.
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {globalBalanceActive > 0 ? (
        <div className="mb-5 rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 text-xs text-blue-200">
          <strong>{globalBalanceActive} demande(s) active(s)</strong> utilisent le solde global du client et
          ne nécessitent volontairement pas de paiement d’origine.
        </div>
      ) : null}

      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-surface-1 p-3 shadow-sm md:grid-cols-[minmax(240px,1fr)_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Référence, client, paiement, motif…"
            className="pl-9"
          />
        </div>
        <Select name="status" defaultValue={status}>
          <option value="ALL">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button variant="outline">Appliquer</Button>
          {q || status !== "ALL" ? (
            <Link href="/app/finance/refunds">
              <Button type="button" variant="ghost">
                Réinitialiser
              </Button>
            </Link>
          ) : null}
        </div>
      </form>

      {refunds.length === 0 ? (
        <EmptyState
          icon={Undo2}
          title="Aucun remboursement correspondant"
          description="Modifiez les filtres ou créez une nouvelle demande de remboursement."
          actionHref="/app/finance/refunds/new"
          actionLabel="Créer une demande"
        />
      ) : (
        <>
          <div className="mb-3">
            <ListCount shown={refunds.length} total={total} label="remboursement" />
          </div>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Référence</TH>
                  <TH>Client</TH>
                  <TH>Source</TH>
                  <TH>Demandé</TH>
                  <TH>Payé / restant</TH>
                  <TH>Prochaine échéance</TH>
                  <TH>Statut</TH>
                  <TH>Créé</TH>
                </tr>
              </THead>
              <tbody>
                {refunds.map((r) => {
                  const paid = refundPaidTotal(r.installments);
                  const remaining = refundRemaining(r.amount, r.installments);
                  const open = r.installments.filter((i) => !["PAID", "CANCELLED"].includes(i.status));
                  const next = open[0] || null;
                  const late = r.installments.filter((i) => i.status === "LATE").length;
                  const possibleDuplicate = Boolean(
                    r.paymentId &&
                    activeStatuses.has(r.status) &&
                    (activeByPayment.get(r.paymentId) || 0) > 1,
                  );
                  const nextLabel =
                    r.status === "PAID"
                      ? "Terminé"
                      : r.status === "CANCELLED"
                        ? "Annulé"
                        : r.status === "REJECTED"
                          ? "Rejeté"
                          : "Aucun échéancier";
                  return (
                    <TR key={r.id}>
                      <TD>
                        <Link
                          href={`/app/finance/refunds/${r.id}`}
                          className="registry-id hover:text-electric"
                        >
                          {r.refundNumber}
                        </Link>
                        {possibleDuplicate ? (
                          <div className="mt-1">
                            <Badge className="border border-red-500/20 bg-red-500/10 text-danger">
                              DOUBLON POSSIBLE
                            </Badge>
                          </div>
                        ) : null}
                      </TD>
                      <TD>
                        <Link
                          href={`/app/clients/${r.clientId}/dashboard`}
                          className="font-medium hover:text-electric"
                        >
                          {r.client.firstName} {r.client.lastName}
                        </Link>
                      </TD>
                      <TD>
                        {r.payment ? (
                          <div>
                            <span className="registry-id">{r.payment.reference}</span>
                            <div className="mt-1 text-[11px] text-muted2">Paiement spécifique</div>
                          </div>
                        ) : (
                          <div>
                            <Badge className="border border-blue-500/20 bg-blue-500/10 text-accent">
                              SOLDE GLOBAL
                            </Badge>
                            <div className="mt-1 text-[11px] text-muted2">Aucun lien paiement requis</div>
                          </div>
                        )}
                      </TD>
                      <TD className="font-medium">{formatMoney(Number(r.amount), r.currency)}</TD>
                      <TD>
                        <div className="text-sm">{formatMoney(paid, r.currency)} payé</div>
                        <div className="text-xs text-muted2">
                          {formatMoney(remaining, r.currency)} restant
                        </div>
                      </TD>
                      <TD>
                        {next ? (
                          <div>
                            <div className={late ? "font-medium text-warning" : "text-sm"}>
                              {formatDate(next.dueDate)}
                            </div>
                            <div className="text-xs text-muted2">
                              {formatMoney(Number(next.amount), r.currency)}
                              {late ? ` · ${late} retard` : ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted2">{nextLabel}</span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={r.status} />
                      </TD>
                      <TD className="text-muted2">{formatDate(r.createdAt)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {refunds.map((r) => {
              const paid = refundPaidTotal(r.installments);
              const remaining = refundRemaining(r.amount, r.installments);
              const open = r.installments.filter((i) => !["PAID", "CANCELLED"].includes(i.status));
              const next = open[0] || null;
              const late = r.installments.filter((i) => i.status === "LATE").length;
              const possibleDuplicate = Boolean(
                r.paymentId && activeStatuses.has(r.status) && (activeByPayment.get(r.paymentId) || 0) > 1,
              );
              return (
                <RecordCard
                  key={r.id}
                  href={`/app/finance/refunds/${r.id}`}
                  title={`${r.client.firstName} ${r.client.lastName}`}
                  subtitle={<span className="registry-id">{r.refundNumber}</span>}
                  badges={
                    <>
                      <StatusBadge status={r.status} />
                      {r.payment ? (
                        <Badge className="border border-line bg-ink/[0.03] text-ink-3">PAIEMENT LIÉ</Badge>
                      ) : (
                        <Badge className="border border-blue-500/20 bg-blue-500/10 text-accent">
                          SOLDE GLOBAL
                        </Badge>
                      )}
                      {possibleDuplicate ? (
                        <Badge className="border border-red-500/20 bg-red-500/10 text-danger">
                          DOUBLON POSSIBLE
                        </Badge>
                      ) : null}
                    </>
                  }
                  footer={`Créé ${formatDate(r.createdAt)}`}
                >
                  <RecordField label="Demandé" value={formatMoney(Number(r.amount), r.currency)} />
                  <RecordField
                    label="Payé"
                    value={formatMoney(paid, r.currency)}
                    valueClassName="text-success"
                  />
                  <RecordField
                    label="Restant"
                    value={formatMoney(remaining, r.currency)}
                    valueClassName={remaining > 0 ? "text-warning" : "text-success"}
                  />
                  <RecordField
                    label="Prochaine échéance"
                    value={next ? `${formatDate(next.dueDate)}${late ? ` · ${late} retard` : ""}` : "—"}
                    valueClassName={late ? "text-warning" : undefined}
                  />
                </RecordCard>
              );
            })}
          </div>
          <Pagination
            basePath="/app/finance/refunds"
            page={page}
            totalPages={totalPages}
            params={paginationParams}
          />
        </>
      )}
    </div>
  );
}
function Metric({ icon: Icon, label, value }: { icon: typeof SearchCheck; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-4 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/10 text-electric">
        <Icon className="h-4 w-4" />
      </span>
      <div className="mt-4 text-xs text-muted2">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  );
}
