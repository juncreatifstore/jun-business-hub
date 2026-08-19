import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentEditor } from "@/components/app/document-editor";
import { saveDocumentVersion, finalizeDocument, duplicateDocument, archiveDocument } from "@/services/documents";
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
  const frozen = doc.status === "SIGNED" || doc.status === "VOIDED";
  const canEdit = can(user, "DOCUMENT_EDIT") && !frozen;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="registry-id text-muted2">{doc.documentId}</p>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold">{doc.title} <StatusBadge status={doc.status} /></h1>
          <p className="mt-1 text-sm text-muted2">
            {doc.type.replaceAll("_", " ")}
            {doc.client ? <> · <Link href={`/app/clients/${doc.client.id}`} className="text-electric hover:underline">{doc.client.firstName} {doc.client.lastName}</Link></> : null}
            {doc.case ? <> · <Link href={`/app/cases/${doc.case.id}`} className="registry-id hover:text-electric">{doc.case.caseNumber}</Link></> : null}
          </p>
          {doc.finalHash ? (
            <p className="registry-id mt-1 text-muted2">SHA-256 {shortHash(doc.finalHash)} · finalized {formatDateTime(doc.finalizedAt)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer"><Button variant="outline">Download PDF</Button></a>
          <Link href={`/app/documents/${doc.id}/print`}><Button variant="ghost">Print view</Button></Link>
          {doc.status === "DRAFT" && can(user, "DOCUMENT_EDIT") ? (
            <form action={finalizeDocument.bind(null, doc.id)}><Button variant="gold">Finalize</Button></form>
          ) : null}
          {doc.status === "FINAL" && can(user, "DOCUMENT_SIGN") ? (
            <form action={createSignatureRequest.bind(null, doc.id)}><Button variant="primary">Send for signature</Button></form>
          ) : null}
          {can(user, "DOCUMENT_CREATE") ? (
            <form action={duplicateDocument.bind(null, doc.id)}><Button variant="ghost">Duplicate</Button></form>
          ) : null}
          {can(user, "DOCUMENT_DELETE") && doc.status !== "ARCHIVED" ? (
            <form action={archiveDocument.bind(null, doc.id)}><Button variant="ghost" className="text-red-600">Archive</Button></form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <DocumentEditor
          initialContent={latest?.content ?? "<p></p>"}
          action={saveDocumentVersion.bind(null, doc.id)}
          readOnly={!canEdit}
        />
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Versions</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {doc.versions.map((v) => (
                  <li key={v.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Version {v.version}</p>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-xs text-muted2">{v.author.firstName} {v.author.lastName} · {formatDateTime(v.createdAt)}</p>
                    {v.changeNote ? <p className="mt-0.5 text-xs text-muted2">{v.changeNote}</p> : null}
                    <p className="registry-id text-[10px] text-muted2">{shortHash(v.hash)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {doc.signatures.length > 0 ? (
            <Card>
              <CardHeader><CardTitle>Signature</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-line">
                  {doc.signatures.map((s) => (
                    <li key={s.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between">
                        <Link href={`/app/signatures/${s.id}`} className="text-sm font-medium hover:text-electric">{s.provider} request</Link>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-muted2">{recipientCount(s.recipients)} signer(s) · {formatDateTime(s.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
