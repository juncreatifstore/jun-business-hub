import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListCount, Pagination, RecordCard, RecordField } from "@/components/ui/record-list";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  Search,
  Clock3,
  CheckCircle2,
  PenLine,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
  attention?: string;
  recent?: string;
  page?: string;
};
const STATUS_FILTERS = [
  { key: "ALL", label: "Tous" },
  { key: "DRAFT", label: "Brouillons" },
  { key: "FINAL", label: "Finalisés" },
  { key: "SIGNED", label: "Signés" },
  { key: "ARCHIVED", label: "Archivés" },
  { key: "VOIDED", label: "Annulés" },
] as const;
const TYPE_FILTERS = [
  "ALL",
  "CONTRACT",
  "AGREEMENT",
  "REFUND_AGREEMENT",
  "RECEIPT",
  "INVOICE",
  "LETTER",
  "ATTESTATION",
  "AUTHORIZATION",
  "REPORT",
  "CUSTOM",
] as const;
function hrefWith(params: SearchParams, patch: Partial<SearchParams>) {
  const next = new URLSearchParams();
  const merged: SearchParams = { ...params, ...patch };
  if (!Object.prototype.hasOwnProperty.call(patch, "page")) merged.page = undefined;
  Object.entries(merged).forEach(([key, value]) => {
    if (value && value !== "ALL" && value !== "0") next.set(key, value);
  });
  const query = next.toString();
  return `/app/documents${query ? `?${query}` : ""}`;
}
function attentionReason(doc: {
  status: string;
  updatedAt: Date;
  signatures: { status: string; createdAt: Date }[];
}) {
  const ageDays = (Date.now() - doc.updatedAt.getTime()) / 86_400_000;
  if (doc.status === "DRAFT" && ageDays >= 7) return "Brouillon inactif depuis 7 jours ou plus";
  if (doc.status === "FINAL") {
    const active = doc.signatures.some((s) =>
      ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(s.status),
    );
    const signed = doc.signatures.some((s) => s.status === "SIGNED");
    if (!active && !signed) return "Document final prêt pour signature";
  }
  if (doc.status === "VOIDED") return "Document annulé — vérification requise";
  return null;
}

export default async function DocumentsPage(props: { searchParams?: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  await requirePermission("DOCUMENT_READ");
  const params: SearchParams = searchParams ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const status = (params.status ?? "ALL").toUpperCase();
  const type = (params.type ?? "ALL").toUpperCase();
  const attentionOnly = params.attention === "1";
  const recentOnly = params.recent === "1";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const docs = await prisma.document.findMany({
    orderBy: { updatedAt: "desc" },
    take: 500,
    include: {
      client: true,
      case: true,
      author: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
      signatures: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true } },
    },
  });
  const visibleBase = docs.filter((d) =>
    status === "ARCHIVED" || status === "ALL"
      ? status === "ARCHIVED"
        ? d.status === "ARCHIVED"
        : d.status !== "ARCHIVED"
      : true,
  );
  const totalActive = docs.filter((d) => d.status !== "ARCHIVED").length;
  const drafts = docs.filter((d) => d.status === "DRAFT").length;
  const ready = docs.filter(
    (d) =>
      d.status === "FINAL" &&
      !d.signatures.some((s) =>
        ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED", "SIGNED"].includes(s.status),
      ),
  ).length;
  const signed = docs.filter((d) => d.status === "SIGNED").length;
  const recentCutoff = Date.now() - 7 * 86_400_000;
  const recent = docs.filter((d) => d.updatedAt.getTime() >= recentCutoff && d.status !== "ARCHIVED").length;
  const needsAttention = docs.filter((d) => attentionReason(d)).length;
  const filtered = visibleBase.filter((d) => {
    if (status !== "ALL" && status !== "ARCHIVED" && d.status !== status) return false;
    if (type !== "ALL" && d.type !== type) return false;
    if (attentionOnly && !attentionReason(d)) return false;
    if (recentOnly && d.updatedAt.getTime() < recentCutoff) return false;
    if (q) {
      const haystack = [
        d.documentId,
        d.title,
        d.type,
        d.client?.firstName,
        d.client?.lastName,
        d.client?.email,
        d.case?.caseNumber,
        d.author.firstName,
        d.author.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageDocs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const paginationParams = {
    q: params.q || undefined,
    status: status !== "ALL" ? status : undefined,
    type: type !== "ALL" ? type : undefined,
    attention: attentionOnly ? "1" : undefined,
    recent: recentOnly ? "1" : undefined,
  };

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Créez, révisez, finalisez, signez et archivez les documents JUN depuis un seul espace opérationnel."
        actionHref="/app/documents/new"
        actionLabel="Nouveau document"
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-muted2">Actifs</p>
              <FileText className="h-4 w-4 text-accent" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-ink">{totalActive}</p>
          </CardContent>
        </Card>
        <Link href={hrefWith(params, { status: "DRAFT", attention: undefined, recent: undefined })}>
          <Card className="h-full transition hover:border-blue-400/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted2">Brouillons</p>
                <PenLine className="h-4 w-4 text-violet-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{drafts}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={hrefWith(params, { status: "FINAL", attention: undefined, recent: undefined })}>
          <Card className="h-full transition hover:border-blue-400/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted2">À signer</p>
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{ready}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={hrefWith(params, { status: "SIGNED", attention: undefined, recent: undefined })}>
          <Card className="h-full transition hover:border-blue-400/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted2">Signés</p>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{signed}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={hrefWith(params, { attention: "1", status: "ALL", recent: undefined })}>
          <Card className="h-full border-amber-400/20 bg-amber-500/[0.035] transition hover:border-amber-400/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted2">À surveiller</p>
                <AlertTriangle className="h-4 w-4 text-warning" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{needsAttention}</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={hrefWith(params, { recent: "1", attention: undefined, status: "ALL" })}>
          <Card className="h-full transition hover:border-blue-400/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted2">Mis à jour 7j</p>
                <Clock3 className="h-4 w-4 text-ink-3" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink">{recent}</p>
            </CardContent>
          </Card>
        </Link>
      </div>
      <div className="mb-5 rounded-2xl border border-line bg-surface-1 p-4 shadow-sm">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_210px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2" />
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Client, document, email, dossier..."
              className="h-10 w-full rounded-xl border border-line bg-ink/[0.035] pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-2 focus:border-blue-400/50"
            />
          </label>
          <select
            name="status"
            defaultValue={status}
            className="h-10 rounded-xl border border-line bg-surface-1 px-3 text-sm text-ink-2"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            name="type"
            defaultValue={type}
            className="h-10 rounded-xl border border-line bg-surface-1 px-3 text-sm text-ink-2"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t === "ALL" ? "Tous les types" : t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="submit" variant="primary">
              Appliquer
            </Button>
            <Link href="/app/documents">
              <Button type="button" variant="secondary">
                <RefreshCw className="mr-1 h-4 w-4" />
                Réinitialiser
              </Button>
            </Link>
          </div>
          {attentionOnly ? <input type="hidden" name="attention" value="1" /> : null}
          {recentOnly ? <input type="hidden" name="recent" value="1" /> : null}
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s.key}
              href={hrefWith(params, { status: s.key, attention: undefined, recent: undefined })}
              className={`rounded-full border px-3 py-1 text-xs ${status === s.key && !attentionOnly && !recentOnly ? "border-blue-400/40 bg-blue-500/10 text-accent" : "border-line text-ink-3 hover:bg-ink/[0.04]"}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
      {pageDocs.length === 0 ? (
        docs.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun document"
            description="Créez le premier contrat, reçu ou courrier JUN."
            actionHref="/app/documents/new"
            actionLabel="Nouveau document"
          />
        ) : (
          <div className="rounded-2xl border border-line bg-surface-1 p-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-ink-2" />
            <p className="mt-3 font-medium text-ink">Aucun document ne correspond</p>
            <p className="mt-1 text-sm text-muted2">Modifiez la recherche ou réinitialisez les filtres.</p>
            <Link href="/app/documents">
              <Button className="mt-4" variant="secondary">
                Réinitialiser
              </Button>
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="mb-3">
            <ListCount shown={pageDocs.length} total={total} label="document" />
          </div>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>ID registre</TH>
                  <TH>Titre</TH>
                  <TH>Type</TH>
                  <TH>Client / Dossier</TH>
                  <TH>Version</TH>
                  <TH>Statut</TH>
                  <TH>Workflow</TH>
                  <TH>Mise à jour</TH>
                </tr>
              </THead>
              <tbody>
                {pageDocs.map((d) => {
                  const reason = attentionReason(d);
                  const latestSignature = d.signatures[0];
                  return (
                    <TR key={d.id}>
                      <TD>
                        <Link href={`/app/documents/${d.id}`} className="registry-id hover:text-electric">
                          {d.documentId}
                        </Link>
                      </TD>
                      <TD>
                        <Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">
                          {d.title}
                        </Link>
                        {reason ? (
                          <div className="mt-1 inline-flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            {reason}
                          </div>
                        ) : null}
                      </TD>
                      <TD className="text-muted2">{d.type.replaceAll("_", " ")}</TD>
                      <TD>
                        {d.client ? (
                          <Link
                            href={`/app/clients/${d.client.id}/dashboard`}
                            className="hover:text-electric"
                          >
                            {d.client.firstName} {d.client.lastName}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {d.case ? (
                          <div>
                            <Link
                              href={`/app/cases/${d.case.id}/dashboard`}
                              className="registry-id text-xs hover:text-electric"
                            >
                              {d.case.caseNumber}
                            </Link>
                          </div>
                        ) : null}
                      </TD>
                      <TD className="text-muted2">v{d.versions[0]?.version ?? 1}</TD>
                      <TD>
                        <StatusBadge status={d.status} />
                      </TD>
                      <TD>
                        {latestSignature ? (
                          <Link
                            href={`/app/signatures/${latestSignature.id}`}
                            className="text-xs hover:text-electric"
                          >
                            <StatusBadge status={latestSignature.status} />
                          </Link>
                        ) : d.status === "FINAL" ? (
                          <span className="text-xs text-muted2">Non envoyé</span>
                        ) : (
                          <span className="text-xs text-muted2">—</span>
                        )}
                      </TD>
                      <TD className="text-muted2">{formatDate(d.updatedAt)}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <div className="grid gap-3 md:hidden">
            {pageDocs.map((d) => {
              const reason = attentionReason(d);
              const latestSignature = d.signatures[0];
              return (
                <RecordCard
                  key={d.id}
                  href={`/app/documents/${d.id}`}
                  title={d.title}
                  subtitle={<span className="registry-id">{d.documentId}</span>}
                  badges={
                    <>
                      <StatusBadge status={d.status} />
                      <Badge className="border border-line bg-ink/[0.03] text-ink-3">
                        {d.type.replaceAll("_", " ")}
                      </Badge>
                      {latestSignature ? <StatusBadge status={latestSignature.status} /> : null}
                    </>
                  }
                  footer={`Mis à jour ${formatDate(d.updatedAt)}`}
                >
                  <RecordField
                    label="Client"
                    value={d.client ? `${d.client.firstName} ${d.client.lastName}` : "—"}
                  />
                  <RecordField label="Dossier" value={d.case?.caseNumber ?? "—"} />
                  <RecordField label="Version" value={`v${d.versions[0]?.version ?? 1}`} />
                  {reason ? (
                    <RecordField label="Attention" value={reason} valueClassName="text-warning" />
                  ) : null}
                </RecordCard>
              );
            })}
          </div>
          <Pagination
            basePath="/app/documents"
            page={page}
            totalPages={totalPages}
            params={paginationParams}
          />
        </>
      )}
    </div>
  );
}
