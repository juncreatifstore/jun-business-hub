import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";
import { signatureRecipients, signatureRequestMeta } from "@/lib/signature-recipients";
import { AlertTriangle, CheckCircle2, Clock3, Eye, FileSignature, MailCheck, PenLine, Search, Send, ShieldCheck, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "READY_FOR_SIGNATURE", label: "Prepared", icon: FileSignature },
  { key: "SENT", label: "Sent", icon: Send },
  { key: "VIEWED", label: "Viewed", icon: Eye },
  { key: "VERIFIED", label: "Verified", icon: ShieldCheck },
  { key: "PARTIALLY_SIGNED", label: "Partially Signed", icon: Clock3 },
  { key: "SIGNED", label: "Signed", icon: CheckCircle2 },
  { key: "DECLINED", label: "Declined", icon: XCircle },
  { key: "EXPIRED", label: "Expired", icon: AlertTriangle },
] as const;

type DashboardFilter = typeof FILTERS[number]["key"];

type SearchParams = {
  status?: string;
  q?: string;
  attention?: string;
  expiring?: string;
};

function expiryFor(request: { recipients: unknown; sentAt: Date | null }) {
  const meta = signatureRequestMeta(request.recipients);
  if (meta.expiresAt) {
    const parsed = new Date(meta.expiresAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return request.sentAt ? new Date(request.sentAt.getTime() + 14 * 24 * 60 * 60 * 1000) : null;
}

function verifiedRequest(recipients: ReturnType<typeof signatureRecipients>) {
  return recipients.length > 0 && recipients.some((r) => Boolean(r.verifiedAt));
}

function attentionReason(request: { status: string; recipients: unknown; sentAt: Date | null }, now: Date) {
  if (request.status === "DECLINED") return "Declined — review required";
  if (request.status === "EXPIRED") return "Expired — create a new request";
  if (!["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) return null;

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const current = recipients.find((r) => !r.signedAt && !r.declinedAt);
  const expiresAt = expiryFor(request);
  if (expiresAt) {
    const remaining = expiresAt.getTime() - now.getTime();
    if (remaining > 0 && remaining <= 3 * 24 * 60 * 60 * 1000) return "Expires within 3 days";
  }
  if (current && !current.invitationSentAt) return "Current signer has not received an invitation";
  if (current?.invitationSentAt && !current.viewedAt) {
    const age = now.getTime() - new Date(current.invitationSentAt).getTime();
    if (age >= 48 * 60 * 60 * 1000) return "Invitation not viewed after 48 hours";
  }
  return null;
}

function queryHref(params: SearchParams, patch: Partial<SearchParams>) {
  const merged = { ...params, ...patch };
  const sp = new URLSearchParams();
  if (merged.status) sp.set("status", merged.status);
  if (merged.q) sp.set("q", merged.q);
  if (merged.attention) sp.set("attention", merged.attention);
  if (merged.expiring) sp.set("expiring", merged.expiring);
  const qs = sp.toString();
  return `/app/signatures${qs ? `?${qs}` : ""}`;
}

export default async function SignaturesPage({ searchParams }: { searchParams?: SearchParams }) {
  await requirePermission("DOCUMENT_READ");
  const params = searchParams ?? {};
  const status = FILTERS.some((f) => f.key === params.status) ? params.status as DashboardFilter : undefined;
  const query = (params.q ?? "").trim().toLowerCase();
  const attentionOnly = params.attention === "1";
  const expiringOnly = params.expiring === "1";
  const now = new Date();

  const requests = await prisma.signatureRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      document: { include: { client: true } },
      createdBy: true,
    },
  });

  const enriched = requests.map((request) => {
    const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
    const signed = recipients.filter((r) => r.signedAt).length;
    const verified = verifiedRequest(recipients);
    const expiresAt = expiryFor(request);
    const attention = attentionReason(request, now);
    const expiringSoon = Boolean(
      expiresAt &&
      ["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status) &&
      expiresAt.getTime() > now.getTime() &&
      expiresAt.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000
    );
    return { request, recipients, signed, verified, expiresAt, attention, expiringSoon };
  });

  const statusCounts = Object.fromEntries(FILTERS.map((filter) => [
    filter.key,
    enriched.filter((item) => filter.key === "VERIFIED" ? item.verified : item.request.status === filter.key).length,
  ]));

  const activatedStatuses = new Set(["SENT", "VIEWED", "PARTIALLY_SIGNED", "SIGNED", "DECLINED", "EXPIRED"]);
  const activated = enriched.filter((item) => activatedStatuses.has(item.request.status)).length;
  const completed = enriched.filter((item) => item.request.status === "SIGNED").length;
  const signatureRate = activated > 0 ? Math.round((completed / activated) * 100) : 0;
  const attentionCount = enriched.filter((item) => Boolean(item.attention)).length;
  const expiringCount = enriched.filter((item) => item.expiringSoon).length;

  const filtered = enriched.filter((item) => {
    if (status && (status === "VERIFIED" ? !item.verified : item.request.status !== status)) return false;
    if (attentionOnly && !item.attention) return false;
    if (expiringOnly && !item.expiringSoon) return false;
    if (!query) return true;

    const client = item.request.document.client;
    const haystack = [
      item.request.document.documentId,
      item.request.document.title,
      client?.firstName,
      client?.lastName,
      client?.email,
      client?.internalId,
      ...item.recipients.flatMap((r) => [r.name, r.email, r.role ?? ""]),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });

  return (
    <div>
      <PageHeader
        title="Signature Dashboard"
        subtitle="Monitor preparation, identity verification, routing, completion and exceptions across JUN Secure Sign."
        actions={<Link href="/app/signatures/new"><Button variant="primary">New signature request</Button></Link>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted2">Signature rate</p><div className="mt-2 flex items-end justify-between gap-3"><p className="text-3xl font-semibold">{signatureRate}%</p><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div><p className="mt-1 text-xs text-muted2">{completed} signed / {activated} activated</p></CardContent></Card>
        <Link href={queryHref(params, { attention: attentionOnly ? undefined : "1" })}><Card className={attentionOnly ? "border-amber-400" : ""}><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted2">Needs attention</p><div className="mt-2 flex items-end justify-between"><p className="text-3xl font-semibold">{attentionCount}</p><AlertTriangle className="h-5 w-5 text-amber-600" /></div><p className="mt-1 text-xs text-muted2">Exceptions and stalled requests</p></CardContent></Card></Link>
        <Link href={queryHref(params, { expiring: expiringOnly ? undefined : "1" })}><Card className={expiringOnly ? "border-amber-400" : ""}><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted2">Expiring soon</p><div className="mt-2 flex items-end justify-between"><p className="text-3xl font-semibold">{expiringCount}</p><Clock3 className="h-5 w-5 text-amber-600" /></div><p className="mt-1 text-xs text-muted2">Active requests due within 3 days</p></CardContent></Card></Link>
        <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wider text-muted2">Total requests</p><div className="mt-2 flex items-end justify-between"><p className="text-3xl font-semibold">{enriched.length}</p><FileSignature className="h-5 w-5 text-muted2" /></div><p className="mt-1 text-xs text-muted2">Up to 500 latest requests</p></CardContent></Card>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href={queryHref(params, { status: undefined })}><Button size="sm" variant={!status ? "primary" : "secondary"}>All <span className="ml-1 opacity-70">{enriched.length}</span></Button></Link>
        {FILTERS.map((filter) => (
          <Link key={filter.key} href={queryHref(params, { status: status === filter.key ? undefined : filter.key })}>
            <Button size="sm" variant={status === filter.key ? "primary" : "secondary"}><filter.icon className="mr-1.5 h-3.5 w-3.5" />{filter.label}<span className="ml-1 opacity-70">{statusCounts[filter.key] ?? 0}</span></Button>
          </Link>
        ))}
      </div>

      <form method="get" action="/app/signatures" className="mb-5 flex flex-wrap gap-2 rounded-xl border border-line bg-white p-3">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        {attentionOnly ? <input type="hidden" name="attention" value="1" /> : null}
        {expiringOnly ? <input type="hidden" name="expiring" value="1" /> : null}
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted2" />
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search client, document, signer email..." className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-electric focus:ring-2 focus:ring-electric/20" />
        </div>
        <Button type="submit" variant="secondary">Search</Button>
        {(query || status || attentionOnly || expiringOnly) ? <Link href="/app/signatures"><Button type="button" variant="ghost">Clear filters</Button></Link> : null}
      </form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted2">
        <p>{filtered.length} request{filtered.length === 1 ? "" : "s"} shown</p>
        {(attentionOnly || expiringOnly) ? <p>{attentionOnly ? "Needs attention" : ""}{attentionOnly && expiringOnly ? " · " : ""}{expiringOnly ? "Expiring within 3 days" : ""}</p> : null}
      </div>

      {filtered.length === 0 ? (
        requests.length === 0
          ? <EmptyState icon={PenLine} title="No signature requests" description="Create your first signature request from a finalized document." actionHref="/app/signatures/new" actionLabel="New signature request" />
          : <EmptyState icon={Search} title="No matching requests" description="Try another status, client, document ID or signer email." />
      ) : (
        <Table>
          <THead><tr><TH>Document / client</TH><TH>Signer progress</TH><TH>Status</TH><TH>Expiry</TH><TH>Attention</TH><TH>Created</TH></tr></THead>
          <tbody>
            {filtered.map(({ request, recipients, signed, verified, expiresAt, attention }) => {
              const client = request.document.client;
              const current = recipients.find((r) => !r.signedAt && !r.declinedAt);
              return (
                <TR key={request.id}>
                  <TD>
                    <Link href={`/app/signatures/${request.id}`} className="registry-id font-medium hover:text-electric">{request.document.documentId}</Link>
                    <div className="max-w-[320px] truncate text-xs text-muted2">{request.document.title}</div>
                    {client ? <div className="mt-1 text-xs">{client.firstName} {client.lastName}{client.email ? <span className="text-muted2"> · {client.email}</span> : null}</div> : <div className="mt-1 text-xs text-muted2">No client linked</div>}
                  </TD>
                  <TD>
                    <div className="text-sm font-medium">{signed}/{recipients.length} signed</div>
                    <div className="mt-0.5 text-xs text-muted2">{verified ? <span className="mr-2 inline-flex items-center gap-1 text-emerald-600"><MailCheck className="h-3 w-3" />Verified</span> : null}{current ? `Current: ${current.name} · ${current.email}` : signed === recipients.length && recipients.length > 0 ? "All signers complete" : "—"}</div>
                  </TD>
                  <TD><StatusBadge status={request.status} /></TD>
                  <TD className="text-muted2">{expiresAt ? <><div>{formatDate(expiresAt)}</div><div className="text-xs">{formatDateTime(expiresAt)}</div></> : "—"}</TD>
                  <TD>{attention ? <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{attention}</span> : <span className="text-xs text-muted2">—</span>}</TD>
                  <TD className="text-muted2"><div>{formatDate(request.createdAt)}</div><div className="text-xs">{request.createdBy.firstName} {request.createdBy.lastName}</div></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
