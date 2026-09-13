import { tr } from "@/lib/i18n-server";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ListCount, Pagination, RecordCard, RecordField } from "@/components/ui/record-list";
import { formatDate, formatMoney } from "@/lib/utils";
import { getPaymentCoreMetaMap, paymentBalance } from "@/lib/finance-payment-core";
import { CircleDollarSign, Clock3, CreditCard, FileCheck2, Search, Inbox } from "lucide-react";
import { PaymentRequestSendPanel } from "@/components/app/payment-request-send-panel";
import { PAY_METHODS, getPaymentInstructions, payMethodLabel } from "@/lib/payment-requests";
import { savePaymentInstructionsAction } from "@/services/payment-requests";
import { can } from "@/lib/auth";

export const dynamic = "force-dynamic";
const STATUSES = ["PENDING", "CONFIRMED", "REJECTED", "REFUNDED", "PARTIALLY_REFUNDED"];
const METHODS = ["ZELLE", "STRIPE", "PAYPAL", "MERCADO_PAGO", "BANK_TRANSFER", "CASH", "MONCASH", "OTHER"];
const SORTS = ["RECENT", "AMOUNT_DESC", "AMOUNT_ASC"] as const;
type SortKey = (typeof SORTS)[number];
const PAGE_SIZE = 25;
function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function netReceived(amount: number, feeAmount?: number | null) {
  return Math.max(0, roundMoney(amount - Number(feeAmount || 0)));
}

export default async function PaymentsPage(props: {
  searchParams: Promise<{
    status?: string;
    method?: string;
    currency?: string;
    q?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requirePermission("PAYMENT_READ");
  const t = await tr();
  const status = STATUSES.includes(String(searchParams.status)) ? String(searchParams.status) : "ALL";
  const method = METHODS.includes(String(searchParams.method)) ? String(searchParams.method) : "ALL";
  const currency = String(searchParams.currency || "")
    .trim()
    .toUpperCase()
    .slice(0, 3);
  const q = String(searchParams.q || "").trim();
  const sort = SORTS.includes(searchParams.sort as SortKey) ? (searchParams.sort as SortKey) : "RECENT";
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const where: any = {
    ...(status !== "ALL" ? { status } : {}),
    ...(method !== "ALL" ? { method } : {}),
    ...(currency ? { currency } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q, mode: "insensitive" } },
            { providerRef: { contains: q, mode: "insensitive" } },
            { client: { firstName: { contains: q, mode: "insensitive" } } },
            { client: { lastName: { contains: q, mode: "insensitive" } } },
            { client: { internalId: { contains: q, mode: "insensitive" } } },
            { case: { caseNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const total = await prisma.payment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const orderBy: any =
    sort === "AMOUNT_DESC"
      ? [{ amount: "desc" }, { createdAt: "desc" }]
      : sort === "AMOUNT_ASC"
        ? [{ amount: "asc" }, { createdAt: "desc" }]
        : [{ paidAt: "desc" }, { createdAt: "desc" }];
  const [requests, reqClients, instructions] = await Promise.all([
    prisma.paymentRequest.findMany({
      where: { status: { in: ["SENT", "VIEWED", "PROOF_SUBMITTED"] } },
      orderBy: [{ status: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
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
    getPaymentInstructions(),
  ]);
  const [payments, pendingCount, confirmedPayments, proofCount] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        client: true,
        case: true,
        files: { where: { category: "PAYMENT_PROOF", archivedAt: null }, select: { id: true } },
      },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.payment.findMany({
      where: { status: "CONFIRMED" },
      select: { id: true, amount: true, currency: true },
    }),
    prisma.file.count({
      where: { isVault: false, archivedAt: null, category: "PAYMENT_PROOF", paymentId: { not: null } },
    }),
  ]);
  const allMetaIds = [...new Set([...payments.map((p) => p.id), ...confirmedPayments.map((p) => p.id)])];
  const metaMap = await getPaymentCoreMetaMap(allMetaIds);
  const totals = new Map<string, number>();
  for (const p of confirmedPayments) {
    const meta = metaMap.get(p.id);
    const net = netReceived(Number(p.amount), meta?.feeAmount);
    totals.set(p.currency, roundMoney((totals.get(p.currency) || 0) + net));
  }
  const collected = totals.size
    ? [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([cur, total]) =>
            `${cur} ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        )
        .join(" · ")
    : "—";
  const paginationParams = {
    q: q || undefined,
    status: status !== "ALL" ? status : undefined,
    method: method !== "ALL" ? method : undefined,
    currency: currency || undefined,
    sort: sort !== "RECENT" ? sort : undefined,
  };

  return (
    <div>
      <PageHeader
        title={t(t("Paiements", "Payments"), "Payments")}
        subtitle={t(
          t(
            "Registre financier des encaissements, validations, soldes, preuves et reçus.",
            "Financial register of inflows, validations, balances, proofs and receipts.",
          ),
          "Financial register of inflows, validations, balances, proofs and receipts.",
        )}
        actionHref="/app/finance/payments/new"
        actionLabel={t(t("Enregistrer un paiement", "Record a payment"), "Record a payment")}
      />
      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <Inbox className="h-4 w-4 text-electric" />{" "}
              {t(t("Demandes de paiement", "Payment requests"), "Payment requests")}
              <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted2">
                {requests.filter((r) => r.status === "PROOF_SUBMITTED").length} preuve(s) à confirmer ·{" "}
                {requests.filter((r) => r.status !== "PROOF_SUBMITTED").length} en attente
              </span>
            </div>
          </div>
          {requests.length ? (
            <ul className="divide-y divide-line">
              {requests.map((r) => {
                const late = r.dueAt && r.dueAt.getTime() < Date.now() && r.status !== "PROOF_SUBMITTED";
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${r.status === "PROOF_SUBMITTED" ? "bg-amber-50 text-amber-800" : r.status === "VIEWED" ? "bg-blue-50 text-blue-800" : "bg-surface text-muted2"}`}
                    >
                      {r.status === "PROOF_SUBMITTED"
                        ? t("preuve reçue", "proof received")
                        : r.status === "VIEWED"
                          ? t("lien ouvert", "link opened")
                          : t("lien envoyé", "link sent")}
                    </span>
                    <Link
                      prefetch={false}
                      href={`/app/finance/payments/requests/${r.id}`}
                      className="font-medium hover:text-electric"
                    >
                      {r.client.firstName} {r.client.lastName}
                    </Link>
                    <span className="text-muted2">
                      {r.currency} {Number(r.amount).toFixed(2)} · {r.description}
                      {r.payment ? ` · ${r.payment.reference}` : ""}
                    </span>
                    {r.dueAt ? (
                      <span className={`text-[11px] ${late ? "font-medium text-red-700" : "text-muted2"}`}>
                        {late
                          ? t("en retard", "overdue")
                          : `${t("avant le", "by")} ${r.dueAt.toLocaleDateString("fr-FR")}`}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-muted2">
                      {r.createdAt.toLocaleDateString("fr-FR")}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted2">
              {t(
                t("Aucune demande de paiement en cours.", "No open payment request."),
                "No open payment request.",
              )}
            </p>
          )}
          {can(user, "SETTINGS_MANAGE") ? (
            <details className="border-t border-line px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {t(
                  t(
                    "Instructions de paiement affichées aux clients",
                    "Payment instructions shown to clients",
                  ),
                  "Payment instructions shown to clients",
                )}
              </summary>
              <form action={savePaymentInstructionsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                {PAY_METHODS.filter((m) => m.code !== "ONLINE").map((m) => (
                  <label key={m.code} className="text-xs">
                    <span className="mb-1 block font-medium text-muted2">{payMethodLabel(m.code)}</span>
                    <textarea
                      name={`instr_${m.code}`}
                      rows={3}
                      defaultValue={instructions[m.code] ?? ""}
                      placeholder={
                        m.code === "BANK_TRANSFER"
                          ? "Banque, titulaire, IBAN/compte, SWIFT, motif à indiquer…"
                          : m.code === "ZELLE"
                            ? "Adresse e-mail ou téléphone Zelle, nom du bénéficiaire…"
                            : m.code === "CASH"
                              ? "Adresse de l’agence, horaires…"
                              : "Numéro, bénéficiaire…"
                      }
                      className="w-full rounded-lg border border-line bg-white px-2 py-1.5 outline-none focus:border-electric"
                    />
                  </label>
                ))}
                <div className="sm:col-span-2">
                  <Button type="submit" variant="secondary" size="sm">
                    {t(t("Enregistrer les instructions", "Save instructions"), "Save instructions")}
                  </Button>
                </div>
              </form>
            </details>
          ) : null}
        </div>
        <PaymentRequestSendPanel
          returnTo="/app/finance/payments"
          clients={reqClients.map((c) => ({
            id: c.id,
            label: `${c.firstName} ${c.lastName} · ${c.internalId}`,
            email: c.email,
            phone: c.phone,
          }))}
        />
      </div>
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Encaissements confirmés"
          value={collected}
          hint={`${confirmedPayments.length} paiements · net après frais`}
        />
        <Metric
          icon={Clock3}
          label="En attente"
          value={String(pendingCount)}
          hint="À valider par la finance"
        />
        <Metric
          icon={FileCheck2}
          label="Preuves de paiement"
          value={String(proofCount)}
          hint="Pièces liées aux paiements"
        />
        <Metric icon={CreditCard} label="Résultats" value={String(total)} hint="Selon les filtres actuels" />
      </div>
      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-surface-1 p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_160px_175px_105px_165px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Référence, client, dossier, transaction…"
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
        <Select name="method" defaultValue={method}>
          <option value="ALL">Toutes les méthodes</option>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
        <Input name="currency" defaultValue={currency} placeholder="Devise" maxLength={3} />
        <Select name="sort" defaultValue={sort}>
          <option value="RECENT">Plus récents</option>
          <option value="AMOUNT_DESC">Montant décroissant</option>
          <option value="AMOUNT_ASC">Montant croissant</option>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline">Appliquer</Button>
          {q || status !== "ALL" || method !== "ALL" || currency || sort !== "RECENT" ? (
            <Link href="/app/finance/payments">
              <Button type="button" variant="ghost">
                Réinitialiser
              </Button>
            </Link>
          ) : null}
        </div>
      </form>
      {payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t(t("Aucun paiement correspondant", "No matching payment"), "No matching payment")}
          description="Modifiez les filtres ou enregistrez un nouveau paiement."
          actionHref="/app/finance/payments/new"
          actionLabel={t(t("Enregistrer un paiement", "Record a payment"), "Record a payment")}
        />
      ) : (
        <>
          <div className="mb-3">
            <ListCount shown={payments.length} total={total} label="paiement" />
          </div>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Référence</TH>
                  <TH>Client / service</TH>
                  <TH>Net reçu</TH>
                  <TH>Attendu / solde</TH>
                  <TH>Méthode</TH>
                  <TH>Preuve</TH>
                  <TH>Statut</TH>
                  <TH>Date</TH>
                </tr>
              </THead>
              <tbody>
                {payments.map((p) => {
                  const meta = metaMap.get(p.id);
                  const expected = meta?.expectedAmount ?? null;
                  const grossAmount = Number(p.amount);
                  const feeAmount = Number(meta?.feeAmount || 0);
                  const netAmount = netReceived(grossAmount, feeAmount);
                  const balance = paymentBalance(netAmount, expected);
                  return (
                    <TR key={p.id}>
                      <TD>
                        <Link
                          href={`/app/finance/payments/${p.id}`}
                          className="registry-id hover:text-electric"
                        >
                          {p.reference}
                        </Link>
                        {p.providerRef ? (
                          <div className="mt-1 max-w-40 truncate text-[11px] text-muted2">
                            {p.providerRef}
                          </div>
                        ) : null}
                      </TD>
                      <TD>
                        <Link
                          href={`/app/clients/${p.clientId}/dashboard`}
                          className="font-medium hover:text-electric"
                        >
                          {p.client.firstName} {p.client.lastName}
                        </Link>
                        <div className="mt-1 text-[11px] text-muted2">
                          {meta?.serviceLabel || p.case?.caseNumber || "Service non précisé"}
                        </div>
                      </TD>
                      <TD className="font-medium">
                        <div>{formatMoney(netAmount, p.currency)}</div>
                        {feeAmount > 0 ? (
                          <div className="mt-1 text-[11px] font-normal text-muted2">
                            Brut {formatMoney(grossAmount, p.currency)} · frais{" "}
                            {formatMoney(feeAmount, p.currency)}
                          </div>
                        ) : null}
                      </TD>
                      <TD>
                        {expected == null ? (
                          <span className="text-muted2">—</span>
                        ) : (
                          <>
                            <div>{formatMoney(expected, p.currency)}</div>
                            <div
                              className={`text-[11px] ${balance && balance > 0 ? "text-warning" : "text-success"}`}
                            >
                              {balance && balance > 0
                                ? `${formatMoney(balance, p.currency)} dû`
                                : balance && balance < 0
                                  ? `${formatMoney(Math.abs(balance), p.currency)} trop-perçu`
                                  : "Payé intégralement"}
                            </div>
                          </>
                        )}
                      </TD>
                      <TD className="text-muted2">{p.method.replaceAll("_", " ")}</TD>
                      <TD>
                        {p.files.length ? (
                          <span className="text-xs font-medium text-success">{p.files.length} jointe(s)</span>
                        ) : (
                          <span className="text-xs text-muted2">Manquante</span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={p.status} />
                      </TD>
                      <TD className="text-muted2">{formatDate(p.paidAt)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {payments.map((p) => {
              const meta = metaMap.get(p.id);
              const expected = meta?.expectedAmount ?? null;
              const grossAmount = Number(p.amount);
              const feeAmount = Number(meta?.feeAmount || 0);
              const netAmount = netReceived(grossAmount, feeAmount);
              const balance = paymentBalance(netAmount, expected);
              return (
                <RecordCard
                  key={p.id}
                  href={`/app/finance/payments/${p.id}`}
                  title={`${p.client.firstName} ${p.client.lastName}`}
                  subtitle={<span className="registry-id">{p.reference}</span>}
                  badges={
                    <>
                      <StatusBadge status={p.status} />
                      <Badge className="border border-line bg-ink/[0.03] text-ink-3">
                        {p.method.replaceAll("_", " ")}
                      </Badge>
                      {p.files.length ? (
                        <Badge className="border border-emerald-400/20 bg-emerald-500/10 text-success">
                          PREUVE ✓
                        </Badge>
                      ) : null}
                    </>
                  }
                  footer={`${formatDate(p.paidAt)} · ${meta?.serviceLabel || p.case?.caseNumber || "Service non précisé"}`}
                >
                  <RecordField
                    label="Net reçu"
                    value={formatMoney(netAmount, p.currency)}
                    valueClassName="text-success"
                  />
                  {feeAmount > 0 ? (
                    <RecordField
                      label="Brut / frais"
                      value={`${formatMoney(grossAmount, p.currency)} / ${formatMoney(feeAmount, p.currency)}`}
                    />
                  ) : null}
                  <RecordField
                    label="Attendu"
                    value={expected == null ? "—" : formatMoney(expected, p.currency)}
                  />
                  {balance != null ? (
                    <RecordField
                      label="Solde"
                      value={
                        balance > 0
                          ? `${formatMoney(balance, p.currency)} dû`
                          : balance < 0
                            ? `${formatMoney(Math.abs(balance), p.currency)} trop-perçu`
                            : "Payé intégralement"
                      }
                      valueClassName={balance > 0 ? "text-warning" : "text-success"}
                    />
                  ) : null}
                </RecordCard>
              );
            })}
          </div>
          <Pagination
            basePath="/app/finance/payments"
            page={page}
            totalPages={totalPages}
            params={paginationParams}
          />
        </>
      )}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-4 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/10 text-electric">
        <Icon className="h-4 w-4" />
      </span>
      <div className="mt-4 text-xs text-muted2">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted2">{hint}</div>
    </div>
  );
}
