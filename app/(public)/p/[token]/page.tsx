import { notFound } from "next/navigation";
import { getPublicPaymentRequest, payMethodLabel } from "@/lib/payment-requests";
import { ProofForm } from "./proof-form";

export const dynamic = "force-dynamic";

export default async function PaymentRequestPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const r = await getPublicPaymentRequest(token);
  if (!r) notFound();
  const fr = r.language === "fr";
  const money = `${r.currency} ${r.amount.toFixed(2)}`;
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-electric">JUN Creatif &amp; Travel</p>
      <h1 className="mt-2 text-3xl font-semibold">
        {fr
          ? `Bonjour ${r.firstName}, un paiement est demandé`
          : `Hello ${r.firstName}, a payment is requested`}
      </h1>
      <div className="mt-5 rounded-2xl border border-line bg-white p-5">
        <div className="text-sm text-muted2">{r.description}</div>
        <div className="mt-1 text-3xl font-semibold">{money}</div>
        {r.dueAt ? (
          <div className="mt-1 text-sm text-muted2">
            {fr ? "À régler avant le " : "Due by "}
            {r.dueAt.toLocaleDateString(fr ? "fr-FR" : "en-US")}
          </div>
        ) : null}
        {r.message ? <p className="mt-3 rounded-lg bg-surface p-3 text-sm">{r.message}</p> : null}
      </div>
      {r.closed || r.expired ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {fr ? "Ce lien n’est plus valide. Contactez-nous." : "This link is no longer valid. Contact us."}
        </div>
      ) : r.paid ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {fr
            ? `Paiement confirmé (référence ${r.paymentReference}). Merci !`
            : `Payment confirmed (reference ${r.paymentReference}). Thank you!`}
        </div>
      ) : r.proof ? (
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {fr
            ? `Preuve reçue le ${new Date(r.proof.submittedAt).toLocaleDateString("fr-FR")} (${payMethodLabel(r.proof.method)}, ${r.currency} ${r.proof.amount.toFixed(2)}). Notre équipe vérifie ; référence ${r.paymentReference}.`
            : `Proof received on ${new Date(r.proof.submittedAt).toLocaleDateString("en-US")} (${payMethodLabel(r.proof.method, "en")}, ${r.currency} ${r.proof.amount.toFixed(2)}). Our team is verifying; reference ${r.paymentReference}.`}
        </div>
      ) : (
        <ProofForm
          token={token}
          language={r.language}
          amount={r.amount}
          currency={r.currency}
          methods={r.methods.map((m) => ({
            code: m,
            label: payMethodLabel(m, r.language),
            instructions: r.instructions[m as keyof typeof r.instructions] ?? null,
          }))}
          onlineUrl={r.onlineUrl}
          defaultName={r.fullName}
        />
      )}
      <p className="mt-10 text-xs text-muted2">
        {fr ? "Lien valable jusqu’au " : "Link valid until "}
        {r.expiresAt.toLocaleDateString(fr ? "fr-FR" : "en-US")}.
      </p>
    </main>
  );
}
