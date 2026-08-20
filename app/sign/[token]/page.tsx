import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyNativeSigningToken } from "@/lib/native-signature";
import { signatureRecipients } from "@/lib/signature-recipients";
import { completeJunNativeSignature } from "@/services/native-signatures";
import { CheckCircle2, FileSignature2, LockKeyhole } from "lucide-react";

export const dynamic = "force-dynamic";

function errorMessage(code?: string) {
  if (code === "consent_required") return "Please accept the electronic signature consent before signing.";
  if (code === "signature_name_required") return "Enter your full name as your electronic signature.";
  if (code === "waiting_for_previous_signer") return "Another signer must complete their signature before it is your turn.";
  if (code === "request_not_available") return "This signature request is no longer available.";
  if (code === "signer_not_found") return "This signing link does not match a signer on the request.";
  if (code === "invalid_or_expired_link") return "This signing link is invalid or has expired.";
  return null;
}

export default async function NativeSignPage({ params, searchParams }: { params: { token: string }; searchParams?: { error?: string; done?: string } }) {
  const token = params.token;
  const payload = await verifyNativeSigningToken(token);
  if (!payload) notFound();

  const request = await prisma.signatureRequest.findUnique({
    where: { id: payload.requestId },
    include: { document: { include: { client: true } } },
  });
  if (!request || request.provider !== "JUN_NATIVE") notFound();

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const signer = recipients.find((r) => r.email.toLowerCase() === payload.email.toLowerCase() && r.order === payload.order);
  if (!signer) notFound();
  const firstUnsigned = recipients.find((r) => !r.signedAt);
  const isTurn = !signer.signedAt && firstUnsigned?.email.toLowerCase() === signer.email.toLowerCase();
  const done = Boolean(searchParams?.done) || Boolean(signer.signedAt);
  const error = errorMessage(searchParams?.error);

  return (
    <main className="min-h-screen bg-surface px-4 py-8 text-night sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-4 shadow-sm">
          <div>
            <div className="flex items-center gap-2"><span className="text-2xl font-semibold tracking-tight">JUN</span><span className="text-xs text-muted2">SECURE SIGN</span></div>
            <p className="mt-1 text-sm text-muted2">JUN CREATIF AND TRAVEL LLC · Electronic signature</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted2"><LockKeyhole className="h-4 w-4" /> Secure signing link</div>
        </header>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-semibold">Signature recorded</h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted2">Your electronic signature for {request.document.documentId} has been recorded securely. You may close this page.</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-2xl border border-line bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between px-2 py-1">
                <div><p className="font-medium">{request.document.title}</p><p className="text-xs text-muted2">{request.document.documentId}</p></div>
                <FileSignature2 className="h-5 w-5 text-electric" />
              </div>
              <iframe title="Document to sign" src={`/api/sign/${encodeURIComponent(token)}/pdf`} className="h-[760px] w-full rounded-xl border border-line bg-surface" />
            </section>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted2">Signer</p>
                <h1 className="mt-2 text-xl font-semibold">{signer.name}</h1>
                <p className="text-sm text-muted2">{signer.email}</p>
                <p className="mt-2 text-xs text-muted2">Signing order {signer.order} of {recipients.length}</p>
              </div>

              {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

              {!isTurn ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="font-medium">Waiting for the previous signer</p>
                  <p className="mt-2 text-sm text-muted2">This link is valid, but the document must be signed in routing order. Return to this same link after the previous signer has completed.</p>
                </div>
              ) : (
                <form action={completeJunNativeSignature.bind(null, token)} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted2">Electronic signature</p>
                  <label className="mt-4 block text-sm font-medium" htmlFor="signatureName">Type your full name</label>
                  <input id="signatureName" name="signatureName" required defaultValue={signer.name} maxLength={160} className="mt-2 h-12 w-full rounded-lg border border-line px-3 text-xl italic outline-none focus:border-electric focus:ring-2 focus:ring-electric/20" />
                  <p className="mt-2 text-xs text-muted2">Your typed name will be placed in the Signature field. Name, date and initials fields are completed automatically.</p>

                  <label className="mt-5 flex items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm">
                    <input type="checkbox" name="consent" className="mt-1" required />
                    <span>I have reviewed this document and agree to use my typed name as my electronic signature. I understand that submitting this form records my consent, signing time and document integrity information.</span>
                  </label>

                  <button type="submit" className="mt-5 h-11 w-full rounded-lg bg-night px-4 text-sm font-medium text-white hover:bg-night-soft">Accept & sign document</button>
                  <p className="mt-3 text-center text-xs text-muted2">Do not sign if the document is incorrect. Contact JUN before continuing.</p>
                </form>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
