import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/utils";
import { mockSignRecipient, voidSignatureRequest } from "@/services/signatures";
import { signatureRecipients } from "@/lib/signature-recipients";
import { CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SignatureDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user, "DOCUMENT_READ")) notFound();

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: { document: { include: { client: true } }, createdBy: true },
  });
  if (!request) notFound();

  const recipients = signatureRecipients(request.recipients);
  const canSign = can(user, "DOCUMENT_SIGN");
  const open = !["SIGNED", "DECLINED", "EXPIRED", "VOIDED"].includes(request.status);
  const allowMockSign = request.provider === "MOCK" && process.env.NODE_ENV !== "production";

  return (
    <div>
      <PageHeader
        title={`Signature — ${request.document.documentId}`}
        subtitle={request.document.title}
        actions={canSign && open ? <form action={voidSignatureRequest.bind(null, request.id)}><Button variant="danger">Void request</Button></form> : undefined}
      />

      {request.provider === "DOCUSIGN" && open ? (
        <div className="mb-6 rounded-lg border border-electric/30 bg-electric/5 px-4 py-3 text-sm">
          <span className="font-medium">Sent via DocuSign</span>
          <span className="text-muted2"> — signers receive an email from DocuSign; status updates arrive through the secured webhook. </span>
          <span className="text-muted2">Envelope: </span><span className="registry-id text-xs">{request.providerEnvelopeId}</span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Signers</CardTitle></CardHeader>
            <CardContent className="divide-y divide-white/5">
              {recipients.length === 0 ? <p className="py-3 text-sm text-muted2">No recipients recorded.</p> : recipients.map((s, index) => (
                <div key={`${s.email}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-sm text-muted2">{s.email} · order {s.order}</p>
                  </div>
                  {s.signedAt ? (
                    <span className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Signed {formatDateTime(new Date(s.signedAt))}</span>
                  ) : canSign && open && allowMockSign ? (
                    <form action={mockSignRecipient.bind(null, request.id, index)}><Button variant="gold" size="sm">Mock sign (dev)</Button></form>
                  ) : (
                    <span className="text-sm text-muted2">{request.provider === "DOCUSIGN" ? "Awaiting signature via DocuSign" : "Awaiting signature"}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted2">Created:</span> {formatDateTime(request.createdAt)}</p>
              {request.sentAt ? <p><span className="text-muted2">Sent:</span> {formatDateTime(request.sentAt)}</p> : null}
              {request.completedAt ? <p><span className="text-muted2">Completed:</span> {formatDateTime(request.completedAt)}</p> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted2">Status</span><StatusBadge status={request.status} /></div>
              <div className="flex justify-between"><span className="text-muted2">Provider</span><span>{request.provider}</span></div>
              <div className="flex justify-between"><span className="text-muted2">Envelope</span><span className="registry-id text-xs">{request.providerEnvelopeId ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted2">Created</span><span>{formatDate(request.createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-muted2">Created by</span><span>{request.createdBy.firstName} {request.createdBy.lastName}</span></div>
              {request.signedPdfHash ? <div><p className="text-muted2">Signed PDF hash (SHA-256)</p><p className="registry-id break-all text-xs">{request.signedPdfHash}</p></div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Document</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Link href={`/app/documents/${request.documentId}`} className="registry-id hover:text-electric">{request.document.documentId}</Link>
              <p className="text-muted2">{request.document.title}</p>
              {request.document.client ? <p className="text-muted2">Client: <Link href={`/app/clients/${request.document.clientId}`} className="hover:text-electric">{request.document.client.firstName} {request.document.client.lastName}</Link></p> : null}
              <p className="text-xs text-muted2">Verification page: <Link href={`/verify/${request.document.documentId}`} className="text-electric">/verify/{request.document.documentId}</Link></p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
