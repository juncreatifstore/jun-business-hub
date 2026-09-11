import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock3, Inbox, Mail, Settings2, UserRound } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailThreadStateMap } from "@/lib/mail-thread-state";
import { getMailOwnerMap, listMailSlaStates } from "@/lib/mail-operations";
import { EMAIL_ALIASES_SETTING_KEY, type EmailAlias } from "@/lib/email-aliases";
import { assignAliasConversation, setAliasConversationStatus } from "@/services/mail-alias-center";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  OPEN: "Ouvert",
  WAITING_CLIENT: "En attente du client",
  WAITING_INTERNAL: "En attente interne",
  RESOLVED: "Résolu",
};
const statusClasses: Record<string, string> = {
  OPEN: "tint-accent text-accent",
  WAITING_CLIENT: "tint-warning text-warning",
  WAITING_INTERNAL: "bg-violet-100 text-violet-800",
  RESOLVED: "tint-success text-success",
};
const slaClasses: Record<string, string> = {
  OVERDUE: "tint-danger text-danger",
  DUE_SOON: "tint-warning text-warning",
  ON_TRACK: "tint-success text-success",
  PAUSED: "bg-surface-2 text-ink-2",
  RESOLVED: "tint-accent text-accent",
};

function parseAliases(value?: string): EmailAlias[] {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function AliasMailCenterPage({
  searchParams,
}: {
  searchParams: Promise<{
    alias?: string;
    status?: string;
    q?: string;
    toast?: string;
    toast_error?: string;
  }>;
}) {
  const user = await requireUser();
  if (!can(user, "EMAIL_READ")) redirect("/app/forbidden");
  const query = await searchParams;
  const [setting, accessibleIds, staff] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: EMAIL_ALIASES_SETTING_KEY }, select: { value: true } }),
    getAccessibleMailboxIds(user, false),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "CLIENT" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
  ]);
  const aliases = parseAliases(setting?.value);
  const addresses = aliases.map((item) => item.address.toLowerCase());
  const selectedAlias = addresses.includes(String(query.alias || "").toLowerCase())
    ? String(query.alias).toLowerCase()
    : "ALL";
  const threads =
    accessibleIds.length && addresses.length
      ? await prisma.mailThread.findMany({
          where: {
            mailAccountId: { in: accessibleIds },
            aiDraft: null,
          },
          orderBy: { lastMessageAt: "desc" },
          take: 400,
          include: {
            account: { select: { email: true, displayName: true } },
            client: { select: { id: true, firstName: true, lastName: true, internalId: true } },
          },
        })
      : [];
  const ids = threads.map((thread) => thread.id);
  const [stateMap, ownerMap, slaMap] = await Promise.all([
    getMailThreadStateMap(ids),
    getMailOwnerMap(ids),
    listMailSlaStates(ids),
  ]);
  const staffNames = new Map(staff.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
  const requestedStatus = String(query.status || "ACTIVE").toUpperCase();
  const search = String(query.q || "")
    .trim()
    .toLowerCase();
  const rows = threads.filter((thread) => {
    const recipients = thread.toEmails.map((email) => email.toLowerCase());
    if (selectedAlias !== "ALL" && !recipients.includes(selectedAlias)) return false;
    const state = stateMap.get(thread.id);
    if (requestedStatus === "ACTIVE" && state?.workflowStatus === "RESOLVED") return false;
    if (
      requestedStatus !== "ALL" &&
      requestedStatus !== "ACTIVE" &&
      state?.workflowStatus !== requestedStatus
    )
      return false;
    if (
      search &&
      !`${thread.subject || ""} ${thread.fromEmail || ""} ${thread.snippet || ""} ${thread.client?.firstName || ""} ${thread.client?.lastName || ""}`
        .toLowerCase()
        .includes(search)
    )
      return false;
    return true;
  });
  const counts = new Map<string, number>();
  for (const thread of threads) {
    const matched = addresses.filter((address) =>
      thread.toEmails.map((email) => email.toLowerCase()).includes(address),
    );
    for (const address of matched) counts.set(address, (counts.get(address) || 0) + 1);
  }
  const open = threads.filter((thread) => stateMap.get(thread.id)?.workflowStatus !== "RESOLVED").length;
  const unassigned = threads.filter(
    (thread) => stateMap.get(thread.id)?.workflowStatus !== "RESOLVED" && !ownerMap.get(thread.id),
  ).length;
  const overdue = threads.filter((thread) => slaMap.get(thread.id)?.status === "OVERDUE").length;
  const resolved = threads.filter((thread) => stateMap.get(thread.id)?.workflowStatus === "RESOLVED").length;

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Centre des alias"
        subtitle="Une file de travail distincte pour chaque adresse reçue dans admin@juncreatifs.org."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/settings/email/aliases">
              <Button variant="outline">
                <Settings2 className="h-4 w-4" /> Gérer les alias
              </Button>
            </Link>
            <Link href="/app/mail">
              <Button variant="outline">Mail Center</Button>
            </Link>
          </div>
        }
      />

      {query.toast ? (
        <div className="rounded-xl border border-emerald-500/25 bg-success/10 px-4 py-3 text-sm text-success">
          {query.toast}
        </div>
      ) : null}
      {query.toast_error ? (
        <div className="rounded-xl border border-red-500/25 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.toast_error}
        </div>
      ) : null}

      {!aliases.length ? (
        <Card className="border-amber-400/25 bg-warning/[0.05]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-semibold">Aucun alias configuré</p>
              <p className="mt-1 text-sm text-muted2">Ajoutez d’abord vos adresses professionnelles.</p>
            </div>
            <Link href="/app/settings/email/aliases">
              <Button>Configurer les alias</Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Inbox} label="Conversations actives" value={open} tone="text-accent" />
        <Metric icon={UserRound} label="Non attribuées" value={unassigned} tone="text-violet-600" />
        <Metric icon={AlertCircle} label="SLA en retard" value={overdue} tone="text-danger" />
        <Metric icon={CheckCircle2} label="Résolues" value={resolved} tone="text-success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files par alias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Link
              href="/app/mail/aliases"
              className={`rounded-xl border p-4 transition hover:border-electric ${selectedAlias === "ALL" ? "border-electric tint-accent" : "border-line"}`}
            >
              <p className="font-semibold">Tous les alias</p>
              <p className="mt-1 text-2xl font-bold">{threads.length}</p>
            </Link>
            {aliases.map((alias) => (
              <Link
                key={alias.address}
                href={`/app/mail/aliases?alias=${encodeURIComponent(alias.address)}`}
                className={`rounded-xl border p-4 transition hover:border-electric ${selectedAlias === alias.address.toLowerCase() ? "border-electric tint-accent" : "border-line"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <Mail className="h-4 w-4 text-electric" />
                  <Badge
                    className={alias.confirmed ? "tint-success text-success" : "tint-warning text-warning"}
                  >
                    {alias.confirmed ? "ACTIF" : "À CONFIGURER"}
                  </Badge>
                </div>
                <p className="mt-3 break-all font-semibold">{alias.address}</p>
                <p className="mt-1 text-2xl font-bold">{counts.get(alias.address.toLowerCase()) || 0}</p>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>File de travail {selectedAlias !== "ALL" ? `· ${selectedAlias}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            {selectedAlias !== "ALL" ? <input type="hidden" name="alias" value={selectedAlias} /> : null}
            <Input name="q" defaultValue={query.q} placeholder="Rechercher un expéditeur, sujet ou client…" />
            <Select name="status" defaultValue={requestedStatus}>
              <option value="ACTIVE">Conversations actives</option>
              <option value="OPEN">Ouvertes</option>
              <option value="WAITING_CLIENT">En attente du client</option>
              <option value="WAITING_INTERNAL">En attente interne</option>
              <option value="RESOLVED">Résolues</option>
              <option value="ALL">Tous les statuts</option>
            </Select>
            <Button variant="outline">Filtrer</Button>
          </form>

          {!rows.length ? (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted2">
              Aucune conversation pour ce filtre. Synchronisez Gmail si les alias viennent d’être créés.
            </p>
          ) : null}
          {rows.map((thread) => {
            const state = stateMap.get(thread.id)!;
            const ownerId = ownerMap.get(thread.id) || "";
            const sla = slaMap.get(thread.id);
            const matchedAlias =
              addresses.find((address) =>
                thread.toEmails.map((email) => email.toLowerCase()).includes(address),
              ) || selectedAlias;
            return (
              <div key={thread.id} className="rounded-xl border border-line p-4">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={statusClasses[state.workflowStatus]}>
                        {statusLabels[state.workflowStatus]}
                      </Badge>
                      {sla ? (
                        <Badge className={slaClasses[sla.status]}>
                          <Clock3 className="mr-1 h-3 w-3" />
                          {sla.status.replaceAll("_", " ")}
                        </Badge>
                      ) : null}
                      <Badge className="tint-accent text-accent">{matchedAlias}</Badge>
                    </div>
                    <Link
                      href={`/app/mail?mailbox=${thread.mailAccountId}&thread=${thread.id}`}
                      className="mt-3 block break-words font-semibold hover:text-electric hover:underline"
                    >
                      {thread.subject || "(Sans objet)"}
                    </Link>
                    <p className="mt-1 break-all text-sm text-muted2">
                      {thread.fromEmail || "Expéditeur inconnu"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted2">{thread.snippet}</p>
                    <p className="mt-2 text-xs text-muted2">
                      {thread.client
                        ? `Client : ${thread.client.firstName} ${thread.client.lastName} · ${thread.client.internalId}`
                        : "Aucun client associé"}{" "}
                      · Responsable : {ownerId ? staffNames.get(ownerId) || "Employé" : "Non attribué"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <form
                      action={assignAliasConversation.bind(null, thread.id, matchedAlias)}
                      className="flex gap-2"
                    >
                      <Select name="ownerId" defaultValue={ownerId}>
                        <option value="">Non attribué</option>
                        {staff.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.firstName} {member.lastName} · {member.role}
                          </option>
                        ))}
                      </Select>
                      <Button variant="secondary">Attribuer</Button>
                    </form>
                    <form
                      action={setAliasConversationStatus.bind(null, thread.id, matchedAlias)}
                      className="flex gap-2"
                    >
                      <Select name="workflowStatus" defaultValue={state.workflowStatus}>
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <Button variant="outline">Statut</Button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <span className={`rounded-xl bg-ink/[0.04] p-3 ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs text-muted2">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
