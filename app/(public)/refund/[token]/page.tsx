import { notFound } from "next/navigation";
import { getPublicClaim, REASON_CODES, PAYOUT_METHODS } from "@/lib/refund-claims";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";

export default async function RefundClaimPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const c = await getPublicClaim(token);
  if (!c) notFound();
  const fr = c.language === "fr";
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-electric">JUN Creatif &amp; Travel</p>
      <h1 className="mt-2 text-3xl font-semibold">
        {fr
          ? `Bonjour ${c.firstName}, votre demande de remboursement`
          : `Hello ${c.firstName}, your refund request`}
      </h1>
      <p className="mt-3 text-muted2">
        {fr
          ? "Remplissez ce formulaire en quelques minutes. Nos équipes l’examinent sous 5 jours ouvrés et vous répondent par e-mail."
          : "This takes a few minutes. Our team reviews it within 5 business days and replies by e-mail."}
      </p>
      {c.message ? (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm">{c.message}</div>
      ) : null}
      {c.closed || c.expired ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {fr
            ? "Ce lien n’est plus valide. Contactez-nous pour en obtenir un nouveau."
            : "This link is no longer valid. Contact us for a new one."}
        </div>
      ) : c.submitted ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {fr
            ? "Votre demande a bien été envoyée. Vous avez reçu un accusé de réception par e-mail ; nous revenons vers vous rapidement."
            : "Your request was submitted. You received an acknowledgement by e-mail; we will get back to you shortly."}
        </div>
      ) : (
        <ClaimForm
          token={token}
          language={c.language}
          payments={c.payments.map((p) => ({ ...p, date: p.date.toISOString() }))}
          lockedPayment={c.lockedPayment}
          defaultEmail={c.email ?? ""}
          defaultPhone={c.phone ?? ""}
          reasons={REASON_CODES.map((r) => ({ code: r.code, label: fr ? r.fr : r.en }))}
          payouts={PAYOUT_METHODS.map((m) => ({ code: m.code, label: fr ? m.fr : m.en }))}
        />
      )}
      <p className="mt-10 text-xs text-muted2">
        {fr ? "Lien valable jusqu’au " : "Link valid until "}
        {c.expiresAt.toLocaleDateString(fr ? "fr-FR" : "en-US")}.
      </p>
    </main>
  );
}
