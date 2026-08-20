import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createVerifiedNativeSigningToken, nativeSigningExpiry, verifyNativeSigningToken } from "@/lib/native-signature";
import { signatureRecipients, signatureRequestMeta } from "@/lib/signature-recipients";
import { markNativeSignatureViewed } from "@/services/native-signatures";
import { completeVerifiedJunNativeSignature, declineVerifiedJunNativeSignature, sendNativeVerificationCode, verifyNativeVerificationCode } from "@/services/native-signature-otp";
import { NativeSignatureInput } from "@/components/signatures/native-signature-input";
import { CheckCircle2, Download, ExternalLink, FileSignature, LockKeyhole, MailCheck, ShieldCheck, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function errorMessage(code?: string) {
  if (code === "consent_required") return "Please accept the electronic signature consent before signing.";
  if (code === "signature_name_required") return "Enter your full legal name before signing.";
  if (code === "signature_draw_required") return "Draw your signature in the signature box before submitting.";
  if (code === "decline_reason_required") return "Please enter a short reason before declining the document.";
  if (code === "waiting_for_previous_signer") return "Another signer must complete their signature before it is your turn.";
  if (code === "request_expired") return "This signature request has expired. Contact JUN for a new request.";
  if (code === "request_not_available") return "This signature request is no longer available.";
  if (code === "signer_not_found") return "This signing link does not match a signer on the request.";
  if (code === "invalid_or_expired_link") return "This signing link is invalid or has expired.";
  if (code === "verification_required") return "Verify your email before signing or declining this document.";
  if (code === "verification_email_unavailable") return "JUN could not send the verification email. Please contact JUN before signing.";
  if (code === "otp_wait") return "A verification code was just sent. Wait one minute before requesting another code.";
  if (code === "otp_rate_limited") return "Too many verification codes were requested. Try again in about one hour or contact JUN.";
  if (code === "otp_send_first") return "Request a verification code first.";
  if (code === "otp_invalid") return "The verification code is incorrect.";
  if (code === "otp_expired") return "That verification code has expired. Request a new code.";
  if (code === "otp_locked") return "Too many incorrect attempts. Verification is locked for 15 minutes.";
  return null;
}

function maskedEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const shown = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(3, local.length - shown.length))}@${domain}`;
}

function expiryFromRequest(expiresAt: string | undefined, sentAt: Date | null) {
  if (expiresAt) {
    const d = new Date(expiresAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return nativeSigningExpiry(sentAt ?? new Date());
}

export default async function NativeSignPage({ params, searchParams }: { params: { token: string }; searchParams?: { error?: string; done?: string; declined?: string; otp?: string; verified?: string } }) {
  const token = params.token;
  const payload = await verifyNativeSigningToken(token);
  if (!payload) notFound();

  let request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId }, include: { document: { include: { client: true } } } });
  if (!request || request.provider !== "JUN_NATIVE") notFound();

  let recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  let signer = recipients.find((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (!signer) notFound();

  const meta = signatureRequestMeta(request.recipients);
  const done = Boolean(searchParams?.done) || Boolean(signer.signedAt);
  const declined = Boolean(searchParams?.declined) || Boolean(signer.declinedAt) || request.status === "DECLINED";
  const expired = request.status === "EXPIRED" || expiryFromRequest(meta.expiresAt, request.sentAt).getTime() <= Date.now();

  if (!done && !declined && !expired && signer.verifiedAt && !payload.verified) {
    const verifiedToken = await createVerifiedNativeSigningToken({ requestId: payload.requestId, email: payload.email, order: payload.order, linkVersion: payload.linkVersion, sessionId: payload.sessionId }, expiryFromRequest(meta.expiresAt, request.sentAt));
    redirect(`/sign/${encodeURIComponent(verifiedToken)}?verified=1`);
  }

  const verified = Boolean(payload.verified && signer.verifiedAt);
  if (verified && !done && !declined && !expired) {
    await markNativeSignatureViewed(token);
    request = await prisma.signatureRequest.findUnique({ where: { id: payload.requestId }, include: { document: { include: { client: true } } } });
    if (!request) notFound();
    recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
    signer = recipients.find((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
    if (!signer) notFound();
  }

  const firstUnsigned = recipients.find((r) => !r.signedAt);
  const isTurn = !signer.signedAt && !signer.declinedAt && firstUnsigned?.email.toLowerCase() === signer.email.toLowerCase();
  const error = errorMessage(searchParams?.error);
  const pdfUrl = `/api/sign/${encodeURIComponent(token)}/pdf`;
  const signedPdfUrl = `/api/sign/${encodeURIComponent(token)}/signed-pdf`;
  const otpWasSent = Boolean(searchParams?.otp) || Boolean(signer.otpSentAt);

  return (
    <main className="min-h-screen bg-surface px-4 py-8 text-night sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-4 shadow-sm">
          <div><div className="flex items-center gap-2"><span className="text-2xl font-semibold tracking-tight">JUN</span><span className="text-xs text-muted2">SECURE SIGN</span></div><p className="mt-1 text-sm text-muted2">JUN CREATIF AND TRAVEL LLC · Electronic signature</p></div>
          <div className="flex items-center gap-2 text-xs text-muted2"><LockKeyhole className="h-4 w-4" /> Secure signing link</div>
        </header>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-4 text-2xl font-semibold">Signature recorded</h1><p className="mx-auto mt-2 max-w-xl text-sm text-muted2">Your electronic signature for {request.document.documentId} has been recorded securely.</p>{request.signedPdfKey ? <div className="mt-6 flex flex-wrap justify-center gap-3"><a href={signedPdfUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 text-sm font-medium hover:bg-emerald-50"><ExternalLink className="h-4 w-4" />View signed PDF</a><a href={`${signedPdfUrl}?download=1`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-night px-4 text-sm font-medium text-white hover:bg-night-soft"><Download className="h-4 w-4" />Download signed copy</a></div> : null}<p className="mt-5 text-xs text-muted2">Keep this signing link private. You may close this page after saving your copy.</p></div>
        ) : declined ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"><XCircle className="mx-auto h-12 w-12 text-red-600" /><h1 className="mt-4 text-2xl font-semibold">Signature declined</h1><p className="mx-auto mt-2 max-w-xl text-sm text-muted2">Your decision not to sign {request.document.documentId} has been recorded. JUN has been notified.</p>{signer.declineReason ? <p className="mx-auto mt-4 max-w-xl rounded-lg border border-red-200 bg-white p-3 text-sm">Reason: {signer.declineReason}</p> : null}</div>
        ) : expired ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center"><h1 className="text-2xl font-semibold">Signing link expired</h1><p className="mx-auto mt-2 max-w-xl text-sm text-muted2">This signature request is no longer active. Contact JUN CREATIF AND TRAVEL LLC for a new signing request.</p></div>
        ) : !verified ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-line bg-white p-6 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-electric/10"><ShieldCheck className="h-6 w-6 text-electric" /></div>
            <h1 className="mt-4 text-center text-2xl font-semibold">Verify your email</h1>
            <p className="mt-2 text-center text-sm text-muted2">Before JUN displays the document or accepts a signature, confirm that you control the signer email.</p>
            <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-center"><p className="text-xs uppercase tracking-wider text-muted2">Signer</p><p className="mt-1 font-medium">{signer.name}</p><p className="text-sm text-muted2">{maskedEmail(signer.email)}</p></div>
            {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
            {otpWasSent ? <><form action={verifyNativeVerificationCode.bind(null, token)} className="mt-5"><label htmlFor="otp" className="block text-sm font-medium">6-digit verification code</label><input id="otp" name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" placeholder="000000" className="mt-2 h-14 w-full rounded-lg border border-line px-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-electric focus:ring-2 focus:ring-electric/20" /><button type="submit" className="mt-3 h-11 w-full rounded-lg bg-night px-4 text-sm font-medium text-white hover:bg-night-soft"><MailCheck className="mr-2 inline h-4 w-4" />Verify & continue</button></form><form action={sendNativeVerificationCode.bind(null, token)} className="mt-3"><button type="submit" className="h-10 w-full rounded-lg border border-line text-sm font-medium hover:bg-surface">Send a new code</button></form><p className="mt-3 text-center text-xs text-muted2">Code expires after 10 minutes · 5 attempts maximum · 3 codes per hour.</p></> : <form action={sendNativeVerificationCode.bind(null, token)} className="mt-5"><button type="submit" className="h-11 w-full rounded-lg bg-night px-4 text-sm font-medium text-white hover:bg-night-soft">Send verification code</button><p className="mt-3 text-center text-xs text-muted2">JUN will send a one-time code to {maskedEmail(signer.email)}.</p></form>}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-2xl border border-line bg-white p-3 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 py-1"><div><p className="font-medium">{request.document.title}</p><p className="text-xs text-muted2">{request.document.documentId}</p></div><div className="flex items-center gap-3"><a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface"><ExternalLink className="h-3.5 w-3.5" /> Open document</a><FileSignature className="h-5 w-5 text-electric" /></div></div><iframe title="Document to sign" src={pdfUrl} className="h-[760px] w-full rounded-xl border border-line bg-surface" /><p className="px-2 pt-2 text-xs text-muted2">Email verified {signer.verifiedAt ? new Date(signer.verifiedAt).toLocaleString() : ""}. Review the document before signing.</p></section>
            <aside className="space-y-4"><div className="rounded-2xl border border-line bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-muted2">Verified signer</p><h1 className="mt-2 text-xl font-semibold">{signer.name}</h1><p className="text-sm text-muted2">{signer.email}</p><p className="mt-2 text-xs text-emerald-600"><MailCheck className="mr-1 inline h-3.5 w-3.5" /> Email identity verified</p><p className="mt-1 text-xs text-muted2">Signing order {signer.order} of {recipients.length}</p></div>{error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}{!isTurn ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="font-medium">Waiting for the previous signer</p><p className="mt-2 text-sm text-muted2">Your identity is verified, but the document must be signed in routing order.</p></div> : <><form action={completeVerifiedJunNativeSignature.bind(null, token)} className="rounded-2xl border border-line bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-muted2">Electronic signature</p><div className="mt-4"><NativeSignatureInput defaultName={signer.name} /></div><p className="mt-3 text-xs text-muted2">Signature fields use the selected Type or Draw method. Name, date and initials are completed automatically from your verified identity.</p><label className="mt-5 flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm"><input type="checkbox" name="consent" className="mt-1" required /><span>I have reviewed this document and agree to use the signature method selected above as my electronic signature. I understand that submitting this form records my consent, signing time, verified email identity, signature method and document integrity information.</span></label><button type="submit" className="mt-5 h-11 w-full rounded-lg bg-night px-4 text-sm font-medium text-white hover:bg-night-soft">Accept & sign document</button></form><form action={declineVerifiedJunNativeSignature.bind(null, token)} className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-red-600">Cannot sign?</p><label className="mt-3 block text-sm font-medium" htmlFor="reason">Reason for declining</label><textarea id="reason" name="reason" required maxLength={500} rows={3} placeholder="Explain briefly what needs to be corrected." className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-red-400" /><button type="submit" className="mt-3 h-10 w-full rounded-lg border border-red-300 text-sm font-medium text-red-700 hover:bg-red-50">Decline to sign</button></form></>}</aside>
          </div>
        )}
      </div>
    </main>
  );
}
