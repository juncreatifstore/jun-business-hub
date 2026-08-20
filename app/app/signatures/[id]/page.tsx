import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopySigningLink } from "@/components/signatures/copy-signing-link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { mockSignRecipient } from "@/services/signatures";
import { voidTrackedSignatureRequest } from "@/services/signature-actions";
import { sendPreparedSignatureRequest } from "@/services/signature-center";
import { activateJunNativeSigning, sendJunNativeReminder } from "@/services/native-signatures";
import { cancelNativeSignatureRequest, extendSignatureExpiration, regenerateSignerLink, replacePendingSigner, resendSigningInvitation } from "@/services/signature-management";
import { nativeSigningExpiry, nativeSigningUrl } from "@/lib/native-signature";
import { signatureRecipients, signatureRequestMeta } from "@/lib/signature-recipients";
import { ArrowLeft, Ban, CalendarPlus, CheckCircle2, Download, ExternalLink, Eye, FileCheck2, Mail, MapPin, Move, RefreshCw, Send, ShieldCheck, UserPen, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SignatureDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!can(user, "DOCUMENT_READ")) notFound();

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: { document: { include: { client: true } }, createdBy: true },
  });
  if (!request) notFound();

  const managementHistory = await prisma.auditLog.findMany({
    where: { resourceType: "SignatureRequest", resourceId: request.id, action: { startsWith: "JUN_NATIVE_" } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const meta = signatureRequestMeta(request.recipients);
  const canSign = can(user, "DOCUMENT_SIGN");
  const open = !["SIGNED", "DECLINED", "EXPIRED", "VOIDED"].includes(request.status);
  const nativeActive = request.provider === "JUN_NATIVE" && ["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status);
  const allowMockSign = request.provider === "MOCK" && process.env.NODE_ENV !== "production";
  const docusignReady = Boolean(
    (process.env.SIGNATURE_PROVIDER ?? "").toUpperCase() === "DOCUSIGN" &&
    process.env.DOCUSIGN_CLIENT_ID && process.env.DOCUSIGN_USER_ID && process.env.DOCUSIGN_ACCOUNT_ID && process.env.DOCUSIGN_BASE_PATH && process.env.DOCUSIGN_PRIVATE_KEY
  );
  const expiresAt = meta.expiresAt ? new Date(meta.expiresAt) : request.sentAt ? nativeSigningExpiry(request.sentAt) : null;
  const nativeLinks = request.provider === "JUN_NATIVE" && expiresAt && open
    ? await Promise.all(recipients.map(async (r) => ({ email: r.email, url: await nativeSigningUrl(request.id, r.email, r.order, expiresAt, r.linkVersion ?? 1) })))
    : [];
  const firstUnsigned = recipients.find((r) => !r.signedAt && !r.declinedAt);
  const signedPdfBase = `/api/signatures/${request.id}/signed-pdf`;

  return (
    <div>
      <PageHeader
        title={`Signature — ${request.document.documentId}`}
        subtitle={request.document.title}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/signatures"><Button variant="secondary"><ArrowLeft className="mr-2 h-4 w-4" />Back to Signatures</Button></Link>
            {canSign && open ? (
              <>
                {request.status === "READY_FOR_SIGNATURE" ? <Link href={`/app/signatures/${request.id}/prepare`}><Button variant="secondary"><Move className="mr-2 h-4 w-4" />Edit field placement</Button></Link> : null}
                {request.status === "READY_FOR_SIGNATURE" ? <form action={activateJunNativeSigning.bind(null, request.id)}><Button variant="gold"><ShieldCheck className="mr-2 h-4 w-4" />Start JUN signing</Button></form> : null}
                {request.status === "READY_FOR_SIGNATURE" && docusignReady ? <form action={sendPreparedSignatureRequest.bind(null, request.id)}><Button variant="secondary"><Send className="mr-2 h-4 w-4" />Send via DocuSign</Button></form> : null}
                {!nativeActive ? <form action={voidTrackedSignatureRequest.bind(null, request.id)}><Button variant="danger">Void request</Button></form> : null}
              </>
            ) : null}
          </div>
        }
      />

      {request.status === "READY_FOR_SIGNATURE" ? <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm"><span className="font-medium text-amber-700">Prepared — not sent.</span><span className="text-muted2"> All signers and PDF fields are stored in JUN. You can start JUN Secure Sign now{docusignReady ? " or use DocuSign." : "."}</span></div> : null}
      {nativeActive ? <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm"><span className="font-medium text-emerald-700">JUN Secure Sign active.</span><span className="text-muted2"> Routing order, automatic invitations and revocable secure links are enabled{expiresAt ? ` · expires ${formatDateTime(expiresAt)}` : ""}.</span></div> : null}
      {request.status === "DECLINED" ? <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><strong>Signature declined.</strong> Review the signer reason below before creating a new request.</div> : null}
      {request.status === "EXPIRED" ? <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>Signature request expired.</strong> Create a new request to issue fresh secure links.</div> : null}
      {request.status === "VOIDED" && meta.cancelReason ? <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><strong>Signature request cancelled.</strong> {meta.cancelReason}</div> : null}

      {request.status === "SIGNED" && request.signedPdfKey ? (
        <Card className="mb-6 border-emerald-200">
          <CardHeader><CardTitle>Signed package</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link href={signedPdfBase} target="_blank"><Button variant="secondary"><ExternalLink className="mr-2 h-4 w-4" />View signed PDF</Button></Link>
              <Link href={`${signedPdfBase}?download=1`}><Button variant="secondary"><Download className="mr-2 h-4 w-4" />Download signed PDF</Button></Link>
              <Link href={`/api/signatures/${request.id}/certificate`} target="_blank"><Button variant="gold"><FileCheck2 className="mr-2 h-4 w-4" />Certificate / audit trail</Button></Link>
            </div>
            <p className="mt-3 text-xs text-muted2">The archived signed PDF is protected by its SHA-256 integrity hash. S.9 also emails the signed PDF and certificate automatically to each signer.</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Signers & PDF fields</CardTitle></CardHeader>
            <CardContent className="divide-y divide-white/5">
              {recipients.length === 0 ? <p className="py-3 text-sm text-muted2">No recipients recorded.</p> : recipients.map((s, index) => {
                const signingLink = nativeLinks.find((l) => l.email.toLowerCase() === s.email.toLowerCase())?.url;
                const isCurrent = nativeActive && !s.signedAt && !s.declinedAt && firstUnsigned?.email.toLowerCase() === s.email.toLowerCase();
                return <div key={`${s.email}-${index}`} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{s.name}</p>{s.role ? <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-muted2">{s.role.replaceAll("_", " ")}</span> : null}{isCurrent ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">CURRENT SIGNER</span> : null}</div>
                      <p className="text-sm text-muted2">{s.email} · routing order {s.order} · link v{s.linkVersion ?? 1}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted2">
                        {s.invitationSentAt ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Invitation {formatDateTime(new Date(s.invitationSentAt))}</span> : null}
                        {s.viewedAt ? <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />Viewed {formatDateTime(new Date(s.viewedAt))}</span> : null}
                        {s.reminderSentAt ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Reminder {formatDateTime(new Date(s.reminderSentAt))}</span> : null}
                        {s.completionEmailSentAt ? <span className="inline-flex items-center gap-1 text-emerald-600"><Mail className="h-3.5 w-3.5" />Final package emailed {formatDateTime(new Date(s.completionEmailSentAt))}</span> : null}
                      </div>
                    </div>
                    {s.signedAt ? <span className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Signed {formatDateTime(new Date(s.signedAt))}</span> : s.declinedAt ? <span className="flex items-center gap-2 text-sm text-red-600"><XCircle className="h-4 w-4" /> Declined {formatDateTime(new Date(s.declinedAt))}</span> : canSign && open && allowMockSign ? <form action={mockSignRecipient.bind(null, request.id, index)}><Button variant="gold" size="sm">Mock sign (dev)</Button></form> : <span className="text-sm text-muted2">{request.status === "READY_FOR_SIGNATURE" ? "Prepared" : request.provider === "DOCUSIGN" ? "Awaiting signature via DocuSign" : request.provider === "JUN_NATIVE" ? (isCurrent ? "Ready to sign" : "Waiting for routing order") : "Awaiting signature"}</span>}
                  </div>
                  {s.declineReason ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><strong>Decline reason:</strong> {s.declineReason}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2">{(s.fields ?? []).map((f, fieldIndex) => <span key={`${f.type}-${fieldIndex}`} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-muted2"><MapPin className="h-3 w-3" /> {f.type.replaceAll("_", " ")} · p{f.page} · x{f.x} · y{f.y}{f.width ? ` · ${f.width}×${f.height ?? "?"}` : ""}</span>)}</div>

                  {nativeActive && !s.signedAt && !s.declinedAt && canSign ? (
                    <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {signingLink ? <><CopySigningLink url={signingLink} /><Link href={signingLink} target="_blank"><Button size="sm" variant="secondary"><ExternalLink className="mr-1 h-3.5 w-3.5" />Open</Button></Link></> : null}
                        {isCurrent ? <form action={resendSigningInvitation.bind(null, request.id, s.email)}><Button size="sm" variant="secondary"><Mail className="mr-1 h-3.5 w-3.5" />Resend invitation</Button></form> : null}
                        {isCurrent ? <form action={regenerateSignerLink.bind(null, request.id, s.email)}><Button size="sm" variant="secondary"><RefreshCw className="mr-1 h-3.5 w-3.5" />Revoke & regenerate</Button></form> : null}
                        {isCurrent ? <form action={sendJunNativeReminder.bind(null, request.id, s.email)}><Button size="sm" variant="gold"><Mail className="mr-1 h-3.5 w-3.5" />Send reminder</Button></form> : null}
                      </div>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-medium text-electric"><UserPen className="mr-1 inline h-3.5 w-3.5" />Edit / replace signer</summary>
                        <form action={replacePendingSigner.bind(null, request.id, s.order)} className="mt-3 grid gap-2 sm:grid-cols-3">
                          <input name="name" defaultValue={s.name} required className="h-10 rounded-lg border border-line bg-white px-3 text-sm" placeholder="Signer name" />
                          <input name="email" type="email" defaultValue={s.email} required className="h-10 rounded-lg border border-line bg-white px-3 text-sm" placeholder="Email" />
                          <input name="role" defaultValue={s.role ?? ""} className="h-10 rounded-lg border border-line bg-white px-3 text-sm" placeholder="Role" />
                          <div className="sm:col-span-3"><Button size="sm" variant="secondary" type="submit">Save signer changes</Button></div>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </div>;
              })}
            </CardContent>
          </Card>

          {meta.message ? <Card><CardHeader><CardTitle>Accompanying message</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm text-muted2">{meta.message}</p></CardContent></Card> : null}

          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted2">Created:</span> {formatDateTime(request.createdAt)}</p>
              {request.sentAt ? <p><span className="text-muted2">Activated / sent:</span> {formatDateTime(request.sentAt)}</p> : null}
              {expiresAt ? <p><span className="text-muted2">Expires:</span> {formatDateTime(expiresAt)}</p> : null}
              {recipients.map((s) => s.invitationSentAt ? <p key={`invite-${s.order}`}><span className="text-muted2">Invitation sent to {s.name}:</span> {formatDateTime(new Date(s.invitationSentAt))}</p> : null)}
              {recipients.map((s) => s.viewedAt ? <p key={`view-${s.order}`}><span className="text-muted2">Viewed by {s.name}:</span> {formatDateTime(new Date(s.viewedAt))}</p> : null)}
              {recipients.map((s) => s.declinedAt ? <p key={`decline-${s.order}`}><span className="text-muted2">Declined by {s.name}:</span> {formatDateTime(new Date(s.declinedAt))}</p> : null)}
              {request.completedAt ? <p><span className="text-muted2">Completed / closed:</span> {formatDateTime(request.completedAt)}</p> : null}
              {recipients.map((s) => s.completionEmailSentAt ? <p key={`delivery-${s.order}`}><span className="text-muted2">Final package emailed to {s.name}:</span> {formatDateTime(new Date(s.completionEmailSentAt))}</p> : null)}
            </CardContent>
          </Card>

          {managementHistory.length ? (
            <Card>
              <CardHeader><CardTitle>Management history</CardTitle></CardHeader>
              <CardContent className="divide-y divide-line p-0">
                {managementHistory.map((log) => (
                  <div key={log.id} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="registry-id font-medium">{log.action.replaceAll("JUN_NATIVE_", "").replaceAll("_", " ")}</span><span className="text-xs text-muted2">{formatDateTime(log.createdAt)}</span></div>
                    <p className="mt-1 text-xs text-muted2">{log.user ? `${log.user.firstName} ${log.user.lastName}` : "System / signer"}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {nativeActive && canSign ? (
            <Card>
              <CardHeader><CardTitle>S.10 Request management</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <form action={extendSignatureExpiration.bind(null, request.id)}>
                  <label className="text-sm font-medium">Extend signing deadline</label>
                  <div className="mt-2 flex gap-2"><input name="days" type="number" min={1} max={30} defaultValue={7} required className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm" /><Button type="submit" size="sm" variant="secondary"><CalendarPlus className="mr-1 h-3.5 w-3.5" />Extend</Button></div>
                  <p className="mt-1 text-xs text-muted2">Adds 1–30 days and sends the current signer a fresh invitation with the new deadline.</p>
                </form>
                <div className="border-t border-line pt-4">
                  <form action={cancelNativeSignatureRequest.bind(null, request.id)}>
                    <label className="text-sm font-medium text-red-700">Cancel request</label>
                    <textarea name="reason" required minLength={3} maxLength={500} rows={3} className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm" placeholder="Reason for cancellation" />
                    <Button type="submit" size="sm" variant="danger" className="mt-2"><Ban className="mr-1 h-3.5 w-3.5" />Cancel & revoke links</Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted2">Status</span><StatusBadge status={request.status} /></div>
            <div className="flex justify-between"><span className="text-muted2">Provider</span><span>{request.provider}</span></div>
            <div className="flex justify-between"><span className="text-muted2">Signers</span><span>{recipients.length}</span></div>
            <div className="flex justify-between"><span className="text-muted2">Fields</span><span>{recipients.reduce((n, r) => n + (r.fields?.length ?? 0), 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted2">Created</span><span>{formatDate(request.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted2">Created by</span><span>{request.createdBy.firstName} {request.createdBy.lastName}</span></div>
            {meta.cancelledAt ? <div><span className="text-muted2">Cancelled</span><p>{formatDateTime(new Date(meta.cancelledAt))}</p></div> : null}
            {request.signedPdfHash ? <div><p className="text-muted2">Signed PDF hash (SHA-256)</p><p className="registry-id break-all text-xs">{request.signedPdfHash}</p></div> : null}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Document</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><Link href={`/app/documents/${request.documentId}`} className="registry-id hover:text-electric">{request.document.documentId}</Link><p className="text-muted2">{request.document.title}</p>{request.document.client ? <p className="text-muted2">Client: <Link href={`/app/clients/${request.document.clientId}`} className="hover:text-electric">{request.document.client.firstName} {request.document.client.lastName}</Link></p> : null}<p className="text-xs text-muted2">Verification page: <Link href={`/verify/${request.document.documentId}`} className="text-electric">/verify/{request.document.documentId}</Link></p></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
