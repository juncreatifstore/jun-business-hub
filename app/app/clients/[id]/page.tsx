import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount } from "@/lib/client-financial-account";
import { getClientBlock } from "@/lib/client-transaction-block";
import { archiveClient } from "@/services/clients";
import { ClientWorkspaceHeader } from "@/components/app/client-workspace-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import {
  CircleDollarSign,
  FileText,
  FolderKanban,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";

export const dynamic = "force-dynamic";

function moneyList(rows: Array<{ currency: string; value: number }>) {
  if (!rows.length) return formatMoney(0, "USD");
  return rows.map((r) => formatMoney(r.value, r.currency)).join(" · ");
}

const legacyTabRoute: Record<string, string> = {
  account: "account",
  cases: "services",
  documents: "documents",
  contracts: "documents",
  payments: "finance",
  refunds: "finance",
  emails: "whatsapp",
  notes: "history",
  activity: "history",
};

export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const user = await requirePermission("CLIENT_READ");
  const legacyTab = searchParams?.tab;
  if (legacyTab && legacyTab !== "overview" && legacyTabRoute[legacyTab])
    redirect(`/app/clients/${params.id}/${legacyTabRoute[legacyTab]}`);

  const [client, account, block] = await Promise.all([
    prisma.client.findUnique({
      where: { id: params.id },
      include: {
        owner: true,
        tags: true,
        clientNotes: { orderBy: { createdAt: "desc" }, take: 5, include: { author: true } },
        _count: {
          select: {
            cases: true,
            documents: true,
            payments: true,
            refunds: true,
            files: true,
            mailThreads: true,
          },
        },
      },
    }),
    getClientFinancialAccount(params.id),
    getClientBlock(params.id),
  ]);
  if (!client) notFound();

  const blocked = Boolean(block?.blocked);
  const archived = client.status === "ARCHIVED";
  const available = moneyList(account.balances.map((b) => ({ currency: b.currency, value: b.available })));
  const confirmed = moneyList(
    account.balances.map((b) => ({ currency: b.currency, value: b.confirmedFunds })),
  );
  const activeRefunds = moneyList(
    account.balances
      .filter((b) => b.activeRefunds > 0)
      .map((b) => ({ currency: b.currency, value: b.activeRefunds })),
  );
  const commissions = moneyList(
    account.balances
      .filter((b) => b.commissions > 0)
      .map((b) => ({ currency: b.currency, value: b.commissions })),
  );
  const archiveAction = archiveClient.bind(null, client.id);

  return (
    <div className="space-y-5">
      <ClientWorkspaceHeader
        client={client}
        tags={client.tags}
        isPartner={account.profile.isPartner}
        blocked={blocked}
        canUpdate={can(user, "CLIENT_UPDATE")}
        newServicesAllowed={!blocked && !archived}
        paymentsAllowed={!archived}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Profil</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Fiche complète du client</h2>
          <p className="mt-1 text-sm text-slate-500">
            Identité, coordonnées, préférences, responsable et état général du compte.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/clients/${client.id}/relationship`}>
            <Button variant="outline">Relation client</Button>
          </Link>
          {can(user, "CLIENT_UPDATE") ? (
            <Link href={`/app/clients/${client.id}/edit`}>
              <Button variant="primary">Modifier le profil</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={WalletCards}
          label="Solde disponible"
          value={available}
          hint="Après engagements actifs"
          tone="blue"
        />
        <Metric
          icon={CircleDollarSign}
          label="Fonds confirmés"
          value={confirmed}
          hint="Montants confirmés dans JUN"
          tone="green"
        />
        <Metric
          icon={ShieldCheck}
          label="Remboursements actifs"
          value={activeRefunds}
          hint={`${client._count.refunds} remboursement(s) enregistré(s)`}
          tone="amber"
        />
        <Metric
          icon={CircleDollarSign}
          label="Commissions"
          value={commissions}
          hint={account.profile.isPartner ? "Compte partenaire actif" : "Compte client standard"}
          tone="violet"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Identité & coordonnées</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Données principales enregistrées dans le dossier.</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            <Info icon={UserRound} label="Nom complet" value={`${client.firstName} ${client.lastName}`} />
            <Info
              icon={UserRound}
              label="Responsable JUN"
              value={client.owner ? `${client.owner.firstName} ${client.owner.lastName}` : "Non assigné"}
            />
            <Info icon={Mail} label="Email" value={client.email || "—"} />
            <Info icon={Phone} label="Téléphone" value={client.phone || "—"} />
            <Info icon={MessageCircle} label="WhatsApp" value={client.whatsapp || "—"} />
            <Info icon={MapPin} label="Pays" value={client.country || "—"} />
            <Info icon={UserRound} label="Nationalité" value={client.nationality || "—"} />
            <Info
              icon={UserRound}
              label="Date de naissance"
              value={client.birthDate ? formatDate(client.birthDate) : "—"}
            />
            <div className="sm:col-span-2 rounded-xl border border-white/[0.055] bg-white/[0.018] p-3.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                Adresse
              </div>
              <div className="mt-1.5 whitespace-pre-wrap font-medium text-slate-200">
                {client.address || "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Configuration du compte</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Préférences et classification interne.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Setting label="Langue du relevé" value={account.profile.preferredLanguage || "—"} />
            <Setting
              label="Type de compte"
              value={account.profile.isPartner ? "Partenaire" : "Client standard"}
            />
            <Setting
              label="Statut commercial"
              value={blocked ? "Relation terminée" : archived ? "Archivé" : "Actif / autorisé"}
            />
            <div className="border-t border-white/[0.055] pt-4">
              <div className="text-xs text-slate-500">Tags</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {client.tags.length ? (
                  client.tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      className="border border-white/[0.06] bg-white/[0.025] text-slate-500"
                    >
                      {tag.tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-600">Aucun tag</span>
                )}
              </div>
            </div>
            {client.notes ? (
              <div className="rounded-xl border border-white/[0.055] bg-white/[0.018] p-3.5">
                <div className="text-xs text-slate-500">Notes générales du profil</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{client.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Registre du client</CardTitle>
              <p className="mt-1 text-xs text-slate-500">Volume des éléments reliés à cette fiche.</p>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Count
              href={`/app/clients/${client.id}/services`}
              icon={FolderKanban}
              label="Dossiers"
              value={client._count.cases}
            />
            <Count
              href={`/app/clients/${client.id}/documents`}
              icon={FileText}
              label="Documents"
              value={client._count.documents}
            />
            <Count
              href={`/app/clients/${client.id}/documents`}
              icon={FileText}
              label="Fichiers Drive"
              value={client._count.files}
            />
            <Count
              href={`/app/clients/${client.id}/finance`}
              icon={WalletCards}
              label="Paiements"
              value={client._count.payments}
            />
            <Count
              href={`/app/clients/${client.id}/finance`}
              icon={ShieldCheck}
              label="Remboursements"
              value={client._count.refunds}
            />
            <Count
              href={`/app/clients/${client.id}/whatsapp`}
              icon={MessageCircle}
              label="Conversations mail"
              value={client._count.mailThreads}
            />
          </CardContent>
        </Card>

        <Card className="bg-[#0e1624]">
          <CardHeader>
            <div>
              <CardTitle>Dernières notes internes</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Les notes complètes restent disponibles dans Historique.
              </p>
            </div>
            <Link
              href={`/app/clients/${client.id}/history`}
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              Historique
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {client.clientNotes.length ? (
              <div className="divide-y divide-white/[0.055]">
                {client.clientNotes.map((note) => (
                  <div key={note.id} className="px-5 py-3.5">
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-slate-300">
                      {note.body}
                    </p>
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      {note.author.firstName} {note.author.lastName} · {formatDateTime(note.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-500">Aucune note interne.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {can(user, "CLIENT_ARCHIVE") && !archived ? (
        <Card className="border-red-400/10 bg-red-500/[0.035]">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium text-red-200">Archivage du client</p>
              <p className="mt-1 text-xs text-red-300/55">
                L’archivage conserve l’historique complet mais retire le client des opérations actives.
              </p>
            </div>
            <form action={archiveAction}>
              <Button variant="danger">Archiver le client</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
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
  icon: typeof WalletCards;
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "green" | "amber" | "violet";
}) {
  const tones = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-emerald-500/10 text-emerald-400",
    amber: "bg-amber-500/10 text-amber-400",
    violet: "bg-violet-500/10 text-violet-400",
  };
  return (
    <Card className="bg-[#0e1624]">
      <CardContent className="p-4">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="mt-3 text-xs text-slate-500">{label}</div>
        <div className="mt-1 break-words text-lg font-semibold text-slate-100">{value}</div>
        <div className="mt-1 text-[11px] text-slate-600">{hint}</div>
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

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-3">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className="text-sm font-medium text-slate-200">{value}</strong>
    </div>
  );
}

function Count({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
  value: number;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-white/[0.055] bg-white/[0.015] p-3 transition hover:border-blue-400/20 hover:bg-blue-500/[0.04]"
    >
      <Icon className="h-4 w-4 text-slate-600 transition group-hover:text-blue-400" />
      <div className="mt-3 text-xl font-semibold text-slate-100">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-600">{label}</div>
    </Link>
  );
}
