import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount } from "@/lib/client-financial-account";
import { getClientFinanceOverview } from "@/lib/client-finance-overview";
import { getClientBlock } from "@/lib/client-transaction-block";
import { createClientBalanceReminderDraft } from "@/services/client-balance-reminder";
import { restoreClient } from "@/services/clients";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ArchiveRestore,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  FolderOpen,
  Mail,
  MessageCircle,
  Phone,
  ReceiptText,
  UserRound,
  WalletCards,
} from "lucide-react";

export const dynamic = "force-dynamic";

function moneyList(rows: Array<{ currency: string; value: number }>) {
  if (!rows.length) return formatMoney(0, "USD");
  return rows.map((r) => formatMoney(r.value, r.currency)).join(" · ");
}

export default async function Client360Page({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const user = await requirePermission("CLIENT_READ");
  const resolved = await Promise.resolve(params);
  const id = resolved.id;

  const [client, account, finance, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        owner: true,
        tags: true,
        cases: { orderBy: { createdAt: "desc" }, include: { owner: true } },
        documents: { orderBy: { updatedAt: "desc" }, take: 8 },
        payments: { orderBy: { paidAt: "desc" }, take: 8 },
        refunds: { orderBy: { createdAt: "desc" }, take: 8 },
        files: { where: { isVault: false }, orderBy: { createdAt: "desc" }, take: 8 },
        activities: { orderBy: { createdAt: "desc" }, take: 12, include: { user: true } },
      },
    }),
    getClientFinancialAccount(id),
    getClientFinanceOverview(id),
    getClientBlock(id),
  ]);

  if (!client) notFound();

  const blocked = Boolean(block?.blocked);
  const archived = client.status === "ARCHIVED";
  const activeCases = client.cases.filter((c) => !["COMPLETED", "CANCELLED", "ARCHIVED"].includes(c.status));
  const contracts = client.documents.filter((d) =>
    ["CONTRACT", "AGREEMENT", "REFUND_AGREEMENT"].includes(d.type),
  );
  const confirmedNet = moneyList(
    account.balances.map((b) => ({ currency: b.currency, value: b.confirmedFunds })),
  );
  const fundsAfterCommitments = moneyList(
    finance.summaries.map((s) => ({ currency: s.currency, value: s.forecastProfit })),
  );
  const pendingRefunds = moneyList(
    account.balances
      .filter((b) => b.pendingRefunds > 0)
      .map((b) => ({ currency: b.currency, value: b.pendingRefunds })),
  );
  const negativeBalances = finance.summaries.filter((s) => s.forecastProfit < -0.009);
  const debtDisplay = moneyList(
    negativeBalances.map((s) => ({ currency: s.currency, value: Math.abs(s.forecastProfit) })),
  );
  const pendingRefundCount = client.refunds.filter((r) =>
    ["REQUESTED", "UNDER_REVIEW"].includes(r.status),
  ).length;

  const profileChecks = [
    { label: "Email", ok: Boolean(client.email) },
    { label: "Téléphone", ok: Boolean(client.phone) },
    { label: "Adresse", ok: Boolean(client.address) },
    { label: "Pays", ok: Boolean(client.country) },
    { label: "Nationalité", ok: Boolean(client.nationality) },
    { label: "Date de naissance", ok: Boolean(client.birthDate) },
    { label: "Responsable", ok: Boolean(client.ownerId) },
  ];
  const completed = profileChecks.filter((x) => x.ok).length;
  const profilePercent = Math.round((completed / profileChecks.length) * 100);
  const needsAttention = profileChecks.filter((x) => !x.ok);
  const newServicesAllowed = !blocked && !archived && negativeBalances.length === 0;

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        isPartner={account.profile.isPartner}
        blocked={blocked}
        hasDebt={negativeBalances.length > 0}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={newServicesAllowed}
        paymentsAllowed={!archived}
      />

      {archived ? (
        <Card className="border-amber-400/15 bg-amber-500/[0.06]">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="text-sm text-amber-100">
              <strong>Ce client est archivé.</strong>
              <div className="mt-1 text-xs text-amber-200/60">
                L’historique complet reste disponible. Restaurez le client uniquement si JUN souhaite le
                rendre actif de nouveau.
              </div>
            </div>
            {can(user, "CLIENT_ARCHIVE") ? (
              <form action={restoreClient.bind(null, client.id)}>
                <Button variant="outline" type="submit">
                  <ArchiveRestore className="h-4 w-4" /> Restaurer
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {blocked ? (
        <Card className="border-red-400/15 bg-red-500/[0.055]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm text-red-100">
              <strong>Relation commerciale terminée.</strong> Aucune nouvelle prestation ne doit être ouverte.
              Les obligations et archives existantes restent accessibles.
            </div>
            <Link
              href={`/app/clients/${client.id}/relationship`}
              className="text-sm font-medium text-red-300 hover:text-red-200"
            >
              Voir le dossier de clôture →
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Situation actuelle
            </p>
            <h2 className="mt-1 text-sm font-semibold text-slate-200">Vue opérationnelle et financière</h2>
          </div>
          <Link
            href={`/app/clients/${client.id}/statement`}
            className="hidden items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 sm:flex"
          >
            Relevé complet <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            icon={CircleDollarSign}
            label="Fonds confirmés"
            value={confirmedNet}
            hint="Montant net réellement reçu"
            tone="blue"
          />
          <Metric
            icon={WalletCards}
            label="Après engagements"
            value={fundsAfterCommitments}
            hint="Après remboursements et coûts"
            tone={negativeBalances.length ? "red" : "green"}
          />
          <Metric
            icon={FolderOpen}
            label="Dossiers actifs"
            value={String(activeCases.length)}
            hint={`${client.cases.length} dossier(s) au total`}
            tone="violet"
          />
          <Metric
            icon={FileText}
            label="Documents"
            value={String(client.documents.length + client.files.length)}
            hint={`${contracts.length} contrat(s) / accord(s)`}
            tone="blue"
          />
          <Metric
            icon={AlertTriangle}
            label="Remboursements"
            value={pendingRefunds}
            hint={`${pendingRefundCount} à traiter`}
            tone={pendingRefundCount ? "amber" : "green"}
          />
          <Metric
            icon={CheckCircle2}
            label="Profil"
            value={`${profilePercent}%`}
            hint={`${completed}/${profileChecks.length} champs essentiels`}
            tone={profilePercent === 100 ? "green" : "amber"}
          />
        </div>
      </section>

      {negativeBalances.length ? (
        <Card className="overflow-hidden border-red-400/15 bg-[linear-gradient(120deg,rgba(239,68,68,.07),transparent_45%),#0e1624]">
          <CardContent className="p-0">
            <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-red-100">
                    Solde dû — nouvelles prestations bloquées
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
                    Le client doit actuellement <strong className="text-red-300">{debtDisplay}</strong> après
                    les coûts et remboursements engagés. Le solde doit être réglé ou régularisé avant
                    l’ouverture d’une nouvelle prestation.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {can(user, "EMAIL_DRAFT") ? (
                  <form action={createClientBalanceReminderDraft.bind(null, client.id)}>
                    <Button variant="danger" disabled={!client.email}>
                      Préparer un rappel
                    </Button>
                  </form>
                ) : null}
                <Link href={`/app/clients/${client.id}/statement`}>
                  <Button variant="outline">Voir le relevé</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {needsAttention.length ? (
        <Card className="border-amber-400/10 bg-[#0e1624]">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div className="mr-2">
              <p className="text-sm font-medium text-slate-200">Profil à compléter</p>
              <p className="text-xs text-slate-500">Certaines informations essentielles manquent.</p>
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {needsAttention.map((x) => (
                <Badge
                  key={x.label}
                  className="border border-amber-400/15 bg-amber-500/[0.07] text-amber-300"
                >
                  {x.label}
                </Badge>
              ))}
            </div>
            {can(user, "CLIENT_UPDATE") ? (
              <Link
                href={`/app/clients/${client.id}/edit`}
                className="text-sm font-medium text-blue-400 hover:text-blue-300"
              >
                Compléter le profil →
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Identité & contact</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Informations essentielles du dossier client</p>
            </div>
            {can(user, "CLIENT_UPDATE") ? (
              <Link
                href={`/app/clients/${client.id}/edit`}
                className="text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Modifier
              </Link>
            ) : null}
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
              <Info icon={UserRound} label="Nom complet" value={`${client.firstName} ${client.lastName}`} />
              <Info
                icon={UserRound}
                label="Responsable"
                value={client.owner ? `${client.owner.firstName} ${client.owner.lastName}` : "Non assigné"}
              />
              <Info icon={Mail} label="Email" value={client.email || "—"} />
              <Info icon={Phone} label="Téléphone" value={client.phone || "—"} />
              <Info icon={MessageCircle} label="WhatsApp" value={client.whatsapp || "—"} />
              <Info icon={UserRound} label="Nationalité" value={client.nationality || "—"} />
              <Info icon={UserRound} label="Pays" value={client.country || "—"} />
              <Info
                icon={UserRound}
                label="Date de naissance"
                value={client.birthDate ? formatDate(client.birthDate) : "—"}
              />
              <div className="sm:col-span-2 rounded-xl border border-white/[0.055] bg-white/[0.018] p-3">
                <div className="text-xs text-slate-500">Adresse</div>
                <div className="mt-1 font-medium text-slate-200">{client.address || "—"}</div>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Actions rapides</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Les opérations les plus fréquentes</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <Quick
              icon={FolderOpen}
              href={`/app/clients/${client.id}/services`}
              title="Services & dossiers"
              text="Suivre les prestations actives."
            />
            <Quick
              icon={CircleDollarSign}
              href={`/app/clients/${client.id}/finance`}
              title="Finance client"
              text="Paiements, factures et soldes."
            />
            <Quick
              icon={FileText}
              href={`/app/clients/${client.id}/documents`}
              title="Documents"
              text="Documents officiels et fichiers."
            />
            <Quick
              icon={MessageCircle}
              href={`/app/clients/${client.id}/whatsapp`}
              title="Communications"
              text="WhatsApp et échanges client."
            />
            {!archived ? (
              <Quick
                icon={WalletCards}
                href={`/app/finance/payments/new?clientId=${client.id}`}
                title="Enregistrer paiement"
                text="Ajouter un paiement reçu."
              />
            ) : null}
            {!blocked && !archived ? (
              <Quick
                icon={ReceiptText}
                href={`/app/finance/invoices/new?clientId=${client.id}`}
                title="Créer facture"
                text="Facturer une prestation."
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Services en cours</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Dossiers actifs ou en attente</p>
            </div>
            <Link
              href={`/app/clients/${client.id}/services`}
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Voir tout
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {activeCases.length ? (
              <div className="divide-y divide-white/[0.055]">
                {activeCases.slice(0, 6).map((c) => (
                  <Link
                    key={c.id}
                    href={`/app/cases/${c.id}`}
                    className="group flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-white/[0.025]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-200 transition group-hover:text-blue-300">
                        {c.title}
                      </div>
                      <div className="registry-id mt-1 text-[10px] text-slate-600">{c.caseNumber}</div>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">Aucune prestation active.</p>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Activité récente</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Dernières actions enregistrées sur ce client</p>
            </div>
            <Activity className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent className="p-0">
            {client.activities.length ? (
              <div className="divide-y divide-white/[0.055]">
                {client.activities.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex gap-3 px-5 py-3.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,.45)]" />
                    <div className="min-w-0">
                      <div className="text-sm leading-5 text-slate-300">{a.message}</div>
                      <div className="mt-1 text-[10px] text-slate-600">
                        {a.user ? `${a.user.firstName} ${a.user.lastName} · ` : ""}
                        {formatDateTime(a.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">L’activité apparaîtra ici.</p>
            )}
            <div className="border-t border-white/[0.055] p-3 text-center">
              <Link
                href={`/app/clients/${client.id}/history`}
                className="text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                Ouvrir l’historique complet →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
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
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "green" | "violet" | "amber" | "red";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-400 ring-blue-500/15",
    green: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/15",
    violet: "bg-violet-500/10 text-violet-400 ring-violet-500/15",
    amber: "bg-amber-500/10 text-amber-400 ring-amber-500/15",
    red: "bg-red-500/10 text-red-400 ring-red-500/15",
  };
  return (
    <Card className="group bg-[#0e1624] transition hover:-translate-y-0.5 hover:border-white/[0.11]">
      <CardContent className="p-4">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${tones[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="mt-3 text-[11px] font-medium text-slate-500">{label}</div>
        <div className="mt-1 break-words text-lg font-semibold tracking-tight text-slate-100">{value}</div>
        <div className="mt-1 text-[10px] leading-4 text-slate-600">{hint}</div>
      </CardContent>
    </Card>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 break-words font-medium text-slate-200">{value}</div>
    </div>
  );
}

function Quick({
  icon: Icon,
  href,
  title,
  text,
}: {
  icon: typeof FolderOpen;
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3.5 transition hover:border-blue-400/20 hover:bg-blue-500/[0.045]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-slate-500 transition group-hover:bg-blue-500/10 group-hover:text-blue-400">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-600">{text}</span>
      </span>
    </Link>
  );
}
