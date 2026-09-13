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
        <ClaimTracking t={c.tracking} fr={fr} />
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

function ClaimTracking({
  t,
  fr,
}: {
  t: NonNullable<Awaited<ReturnType<typeof getPublicClaim>>>["tracking"];
  fr: boolean;
}) {
  const d = (v: Date | null | undefined) => (v ? v.toLocaleDateString(fr ? "fr-FR" : "en-US") : "");
  const steps = [
    {
      key: "submitted",
      label: fr ? "Demande reçue" : "Request received",
      done: Boolean(t.submittedAt),
      date: t.submittedAt,
    },
    {
      key: "review",
      label: fr ? "Examen par notre équipe" : "Under review",
      done: ["UNDER_REVIEW", "CONVERTED", "REJECTED"].includes(t.status),
      date: t.status === "SUBMITTED" ? null : (t.decidedAt ?? null),
    },
    {
      key: "decision",
      label:
        t.status === "REJECTED"
          ? fr
            ? "Décision : refusée"
            : "Decision: declined"
          : t.status === "CONVERTED"
            ? fr
              ? "Décision : acceptée"
              : "Decision: approved"
            : fr
              ? "Décision"
              : "Decision",
      done: ["CONVERTED", "REJECTED"].includes(t.status),
      date: t.decidedAt,
    },
    ...(t.refund
      ? [
          {
            key: "payout",
            label:
              t.refund.status === "PAID"
                ? fr
                  ? "Remboursement versé"
                  : "Refund paid"
                : t.refund.paid > 0
                  ? fr
                    ? `Versé ${t.refund.currency} ${t.refund.paid.toFixed(2)} sur ${t.refund.amount.toFixed(2)}`
                    : `Paid ${t.refund.currency} ${t.refund.paid.toFixed(2)} of ${t.refund.amount.toFixed(2)}`
                  : fr
                    ? "Versement en préparation"
                    : "Payout in preparation",
            done: t.refund.status === "PAID",
            date: t.refund.status === "PAID" ? t.refund.lastPaidAt : t.refund.nextDue,
          },
        ]
      : []),
  ];
  return (
    <div className="mt-6 rounded-xl border border-line bg-white p-5">
      <div className="text-sm font-semibold">{fr ? "Suivi de votre demande" : "Request status"}</div>
      <ol className="mt-4 space-y-3">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3 text-sm">
            <span
              className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 ${s.done ? (t.status === "REJECTED" && s.key === "decision" ? "border-red-500 bg-red-500" : "border-emerald-500 bg-emerald-500") : "border-line"}`}
            />
            <div>
              <div className={s.done ? "font-medium" : "text-muted2"}>{s.label}</div>
              {s.date ? (
                <div className="text-xs text-muted2">
                  {s.key === "payout" && t.refund?.status !== "PAID"
                    ? fr
                      ? "Prochaine échéance : "
                      : "Next due: "
                    : ""}
                  {d(s.date)}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {t.decisionNote ? <p className="mt-4 rounded-lg bg-surface p-3 text-sm">{t.decisionNote}</p> : null}
      {t.refund ? (
        <p className="mt-4 text-xs text-muted2">
          {fr ? "Dossier de remboursement" : "Refund file"} {t.refund.number}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted2">
        {fr
          ? "Cette page se met à jour automatiquement ; gardez le lien."
          : "This page updates automatically; keep the link."}
      </p>
    </div>
  );
}
