import Link from "next/link";
import { ArrowLeft, GitCompareArrows, RotateCcw, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DocumentEditor } from "@/components/app/document-editor";
import { saveDocumentVersion, createDocumentRevision, duplicateDocument, archiveDocument } from "@/services/documents";
import { restoreDocumentVersion } from "@/services/document-versions";
import { createSignatureRequest } from "@/services/signatures";
import { formatDateTime } from "@/lib/utils";
import { shortHash } from "@/lib/hash";

export const dynamic = "force-dynamic";

function recipientCount(recipients: unknown): number {
  if (Array.isArray(recipients)) return recipients.length;
  if (recipients && typeof recipients === "object") {
    const value = recipients as { signers?: unknown[]; recipients?: unknown[] };
    if (Array.isArray(value.signers)) return value.signers.length;
    if (Array.isArray(value.recipients)) return value.recipients.length;
  }
  return 0;
}

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("DOCUMENT_READ");
  const doc = await prisma.document.findUnique({
    where: { id: params.id },
    include: {
      client: true, case: true, author: true,
      versions: { orderBy: { version: "desc" }, include: { author: true } },
      signatures: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!doc) notFound();
  const latest = doc.versions[0];
  const canEditDraft = can(user, "DOCUMENT_EDIT") && doc.status === "DRAFT";
  const canCreateRevision = can(user, "DOCUMENT_EDIT") && doc.status === "FINAL";

  return (
    <div>
      <div className="mb-4">
        <Link href="/app/documents" className="inline-flex items-center gap-2 text-sm font-medium text-muted2 hover:text-electric"><ArrowLeft className="h-4 w-4" /> Back to Documents</Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{doc.documentId}</p>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold">{doc.title} <StatusBadge status={doc.status} /></h1>
          <p className="mt-1 text-sm text-muted2">
            {doc.type.replaceAll("_", " ")}
            {doc.client ? <> · <Link href={`/app/clients/${doc.client.id}`} className="text-electric hover:underline">{doc.client.firstName} {doc.client.lastName}</Link></> : null}
            {doc.case ? <> · <Link href={`/app/cases/${doc.case.id}`} className="registry-id hover:text-electric">{doc.case.caseNumber}</Link></> : null}
          </p>
          {doc.finalHash ? <p className="registry-id mt-1 text-muted2">Content SHA-256 {shortHash(doc.finalHash)} · finalized {formatDateTime(doc.finalizedAt)}</p> : null}
          {doc.finalPdfHash ? <p className="registry-id mt-1 text-muted2">PDF SHA-256 {shortHash(doc.finalPdfHash)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/app/documents/${doc.id}/versions`}><Button variant="outline"><GitCompareArrows className="mr-1.5 h-4 w-4" />Compare versions</Button></Link>
          <Link href={`/app/documents/${doc.id}/fill`}><Button variant="outline">Preview / Fill</Button></Link>
          <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline">Download PDF</Button></a>
          <Link href={`/app/documents/${doc.id}/print`} target="_blank"><Button variant="ghost">Print view</Button></Link>
          {doc.status === "DRAFT" && can(user, "DOCUMENT_EDIT") ? <Link href={`/app/documents/${doc.id}/finalize`}><Button variant="gold">Review & finalize</Button></Link> : null}
          {doc.status === "FINAL" && can(user, "DOCUMENT_SIGN") ? <form action={createSignatureRequest.bind(null, doc.id)}><Button variant="primary">Send for signature</Button></form> : null}
          {can(user, "DOCUMENT_CREATE") ? <form action={duplicateDocument.bind(null, doc.id)}><Button variant="ghost">Duplicate</Button></form> : null}
          {can(user, "DOCUMENT_DELETE") && doc.status !== "ARCHIVED" ? <form action={archiveDocument.bind(null, doc.id)}><Button variant="ghost" className="text-red-600">Archive</Button></form> : null}
        </div>
      </div>

      {doc.status === "FINAL" ? (
        <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" /> Final document sealed</p>
            <p className="mt-1">The official PDF and its SHA-256 hash are frozen. Direct editing is disabled.</p>
          </div>
          {canCreateRevision ? (
            <form action={createDocumentRevision.bind(null, doc.id)} className="rounded-xl border border-line bg-white p-4">
              <p className="text-sm font-semibold">Create a new revision</p>
              <p className="mt-1 text-xs text-muted2">This creates a new DRAFT version from the current FINAL version. The sealed PDF remains preserved.</p>
              <div className="mt-3 flex gap-2">
                <Input name="reason" required maxLength={300} placeholder="Reason for revision" />
                <Button type="submit" variant="outline">Create revision</Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <DocumentEditor documentId={doc.id} initialContent={latest?.content ?? "<p></p>"} action={saveDocumentVersion.bind(null, doc.id)} readOnly={!canEditDraft} />
        <div className="space-y-4">
          <Card>
            <CardHeader><div className="flex items-center justify-between gap-2"><CardTitle>Versions</CardTitle><Link href={`/app/documents/${doc.id}/versions`} className="text-xs font-medium text-electric hover:underline">Compare</Link></div></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {doc.versions.map((v, index) => (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Version {v.version}{index === 0 ? " · Current" : ""}</p><StatusBadge status={v.status} /></div>
                    <p className="text-xs text-muted2">{v.author.firstName} {v.author.lastName} · {formatDateTime(v.createdAt)}</p>
                    {v.changeNote ? <p className="mt-1 text-xs text-muted2">{v.changeNote}</p> : null}
                    <p className="registry-id mt-1 text-[10px] text-muted2">{shortHash(v.hash)}</p>
                    {canEditDraft && index > 0 ? <form action={restoreDocumentVersion.bind(null, doc.id, v.id)} className="mt-2"><Button type="submit" variant="ghost" className="h-8 px-2 text-xs"><RotateCcw className="mr-1 h-3.5 w-3.5" />Restore as new version</Button></form> : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {doc.signatures.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Signature</CardTitle></CardHeader>
              <CardContent className="p-0"><ul className="divide-y divide-line">{doc.signatures.map((s) => <li key={s.id} className="px-4 py-2.5"><div className="flex items-center justify-between"><Link href={`/app/signatures/${s.id}`} className="text-sm font-medium hover:text-electric">{s.provider} request</Link><StatusBadge status={s.status} /></div><p className="text-xs text-muted2">{recipientCount(s.recipients)} signer(s) · {formatDateTime(s.createdAt)}</p></li>)}</ul></CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
