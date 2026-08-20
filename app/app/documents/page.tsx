import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { FileText, Search, Clock3, CheckCircle2, PenLine, Archive, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  status?: string;
  type?: string;
  attention?: string;
  recent?: string;
};

const STATUS_FILTERS = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "FINAL", label: "Final" },
  { key: "SIGNED", label: "Signed" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "VOIDED", label: "Voided" },
] as const;

const TYPE_FILTERS = ["ALL", "CONTRACT", "AGREEMENT", "REFUND_AGREEMENT", "RECEIPT", "INVOICE", "LETTER", "ATTESTATION", "AUTHORIZATION", "REPORT", "CUSTOM"] as const;

function hrefWith(params: SearchParams, patch: Partial<SearchParams>) {
  const next = new URLSearchParams();
  const merged = { ...params, ...patch };
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
  if (doc.status === "DRAFT" && ageDays >= 7) return "Draft inactive for 7+ days";
  if (doc.status === "FINAL") {
    const active = doc.signatures.some((s) => ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(s.status));
    const signed = doc.signatures.some((s) => s.status === "SIGNED");
    if (!active && !signed) return "Final document ready for signature";
  }
  if (doc.status === "VOIDED") return "Voided document — review required";
  return null;
}

export default async function DocumentsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requirePermission("DOCUMENT_READ");
  const params: SearchParams = searchParams ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const status = (params.status ?? "ALL").toUpperCase();
  const type = (params.type ?? "ALL").toUpperCase();
  const attentionOnly = params.attention === "1";
  const recentOnly = params.recent === "1";

  const docs = await prisma.document.findMany({
    orderBy: { updatedAt: "desc" },
    take: 300,
    include: {
      client: true,
      case: true,
      author: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
      signatures: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true } },
    },
  });

  const visibleBase = docs.filter((d) => status === "ARCHIVED" || status === "ALL" ? (status === "ARCHIVED" ? d.status === "ARCHIVED" : d.status !== "ARCHIVED") : true);
  const totalActive = docs.filter((d) => d.status !== "ARCHIVED").length;
  const drafts = docs.filter((d) => d.status === "DRAFT").length;
  const ready = docs.filter((d) => d.status === "FINAL" && !d.signatures.some((s) => ["READY_FOR_SIGNATURE", "SENT", "VIEWED", "PARTIALLY_SIGNED", "SIGNED"].includes(s.status))).length;
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
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Create, review, finalize, sign and archive every JUN document from one operational workspace."
        actionHref="/app/documents/new"
        actionLabel="New document"
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">Active</p><FileText className="h-4 w-4 text-muted2" /></div><p className="mt-2 text-2xl font-semibold">{totalActive}</p></CardContent></Card>
        <Link href={hrefWith(params, { status: "DRAFT", attention: undefined, recent: undefined })}><Card className="h-full transition hover:border-electric/40"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">Drafts</p><PenLine className="h-4 w-4 text-muted2" /></div><p className="mt-2 text-2xl font-semibold">{drafts}</p></CardContent></Card></Link>
        <Link href={hrefWith(params, { status: "FINAL", attention: undefined, recent: undefined })}><Card className="h-full transition hover:border-electric/40"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">Ready to sign</p><ShieldCheck className="h-4 w-4 text-muted2" /></div><p className="mt-2 text-2xl font-semibold">{ready}</p></CardContent></Card></Link>
        <Link href={hrefWith(params, { status: "SIGNED", attention: undefined, recent: undefined })}><Card className="h-full transition hover:border-electric/40"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">Signed</p><CheckCircle2 className="h-4 w-4 text-muted2" /></div><p className="mt-2 text-2xl font-semibold">{signed}</p></CardContent></Card></Link>
        <Link href={hrefWith(params, { attention: "1", status: "ALL", recent: undefined })}><Card className="h-full border-amber-300/40 transition hover:border-amber-400"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">Needs attention</p><AlertTriangle className="h-4 w-4 text-amber-600" /></div><p className="mt-2 text-2xl font-semibold">{needsAttention}</p></CardContent></Card></Link>
        <Link href={hrefWith(params, { recent: "1", attention: undefined, status: "ALL" })}><Card className="h-full transition hover:border-electric/40"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-wider text-muted2">Updated 7d</p><Clock3 className="h-4 w-4 text-muted2" /></div><p className="mt-2 text-2xl font-semibold">{recent}</p></CardContent></Card></Link>
      </div>

      <div className="mb-5 rounded-xl border border-line bg-white p-4">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_210px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search client, document, email, case..." className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-electric" />
          </label>
          <select name="status" defaultValue={status} className="h-10 rounded-lg border border-line bg-white px-3 text-sm">
            {STATUS_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select name="type" defaultValue={type} className="h-10 rounded-lg border border-line bg-white px-3 text-sm">
            {TYPE_FILTERS.map((t) => <option key={t} value={t}>{t === "ALL" ? "All document types" : t.replaceAll("_", " ")}</option>)}
          </select>
          <div className="flex gap-2"><Button type="submit" variant="primary">Apply</Button><Link href="/app/documents"><Button type="button" variant="secondary"><RefreshCw className="mr-1 h-4 w-4" />Reset</Button></Link></div>
          {attentionOnly ? <input type="hidden" name="attention" value="1" /> : null}
          {recentOnly ? <input type="hidden" name="recent" value="1" /> : null}
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => <Link key={s.key} href={hrefWith(params, { status: s.key, attention: undefined, recent: undefined })} className={`rounded-full border px-3 py-1 text-xs ${status === s.key && !attentionOnly && !recentOnly ? "border-electric bg-electric/10 text-electric" : "border-line text-muted2 hover:bg-surface"}`}>{s.label}</Link>)}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-muted2"><span>{filtered.length} document{filtered.length === 1 ? "" : "s"}</span>{attentionOnly ? <span className="text-amber-700">Showing items that need attention</span> : recentOnly ? <span>Updated in the last 7 days</span> : null}</div>

      {filtered.length === 0 ? (
        docs.length === 0 ? <EmptyState icon={FileText} title="No documents yet" description="Draft the first contract, receipt, or letter — a registry ID is assigned automatically." actionHref="/app/documents/new" actionLabel="New document" /> : <div className="rounded-xl border border-line bg-white p-10 text-center"><FileText className="mx-auto h-8 w-8 text-muted2" /><p className="mt-3 font-medium">No documents match these filters</p><p className="mt-1 text-sm text-muted2">Change the search or reset the dashboard filters.</p><Link href="/app/documents"><Button className="mt-4" variant="secondary">Reset filters</Button></Link></div>
      ) : (
        <Table>
          <THead><tr><TH>Registry ID</TH><TH>Title</TH><TH>Type</TH><TH>Client / Case</TH><TH>Version</TH><TH>Status</TH><TH>Workflow</TH><TH>Updated</TH></tr></THead>
          <tbody>
            {filtered.map((d) => {
              const reason = attentionReason(d);
              const latestSignature = d.signatures[0];
              return (
                <TR key={d.id}>
                  <TD><Link href={`/app/documents/${d.id}`} className="registry-id hover:text-electric">{d.documentId}</Link></TD>
                  <TD><Link href={`/app/documents/${d.id}`} className="font-medium hover:text-electric">{d.title}</Link>{reason ? <div className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />{reason}</div> : null}</TD>
                  <TD className="text-muted2">{d.type.replaceAll("_", " ")}</TD>
                  <TD>{d.client ? <Link href={`/app/clients/${d.client.id}`} className="hover:text-electric">{d.client.firstName} {d.client.lastName}</Link> : "—"}{d.case ? <div><Link href={`/app/cases/${d.case.id}`} className="registry-id text-xs hover:text-electric">{d.case.caseNumber}</Link></div> : null}</TD>
                  <TD className="text-muted2">v{d.versions[0]?.version ?? 1}</TD>
                  <TD><StatusBadge status={d.status} /></TD>
                  <TD>{latestSignature ? <Link href={`/app/signatures/${latestSignature.id}`} className="text-xs hover:text-electric"><StatusBadge status={latestSignature.status} /></Link> : d.status === "FINAL" ? <span className="text-xs text-muted2">Not sent</span> : <span className="text-xs text-muted2">—</span>}</TD>
                  <TD className="text-muted2">{formatDate(d.updatedAt)}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
