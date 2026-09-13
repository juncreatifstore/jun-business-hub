import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyLinkButton } from "@/components/app/copy-link-button";
import { paymentRequestUrl, payMethodLabel, type PaymentProof } from "@/lib/payment-requests";
import {
  confirmPaymentRequestPayment,
  remindPaymentRequest,
  cancelPaymentRequest,
} from "@/services/payment-requests";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = {
  SENT: "Lien envoyé",
  VIEWED: "Lien ouvert par le client",
  PROOF_SUBMITTED: "Preuve reçue — à confirmer",
  PAID: "Payé et confirmé",
  CANCELLED: "Annulée",
  EXPIRED: "Expirée",
};

export default async function PaymentRequestReviewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ toast?: string; toast_error?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const user = await requireUser();
  if (!can(user, "PAYMENT_READ")) redirect("/app/forbidden");
  const r = await prisma.paymentRequest.findUnique({
    where: { id },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, internalId: true, email: true, phone: true },
      },
      case: { select: { id: true, caseNumber: true, title: true } },
      payment: {
        select: { id: true, reference: true, status: true, amount: true, currency: true, method: true },
      },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!r) notFound();
  const proof = r.proof as PaymentProof | null;
  const files = proof?.fileIds.length
    ? await prisma.file.findMany({
        where: { id: { in: proof.fileIds } },
        select: { id: true, name: true, mimeType: true },
      })
    : [];
  const here = `/app/finance/payments/requests/${r.id}`;
  const amountMismatch = proof && Math.abs(proof.amount - Number(r.amount)) > 0.005;

  return (
    <div className="space-y-5">
      <Link
        prefetch={false}
        href="/app/finance/payments"
        className="inline-flex items-center gap-1 text-xs text-muted2 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Paiements
      </Link>
      <PageHeader
        eyebrow="Demande de paiement"
        title={`${r.client.firstName} ${r.client.lastName} — ${r.currency} ${Number(r.amount).toFixed(2)}`}
        subtitle={`${r.description} · ${STATUS[r.status] ?? r.status}${r.dueAt ? ` · échéance ${r.dueAt.toLocaleDateString("fr-FR")}` : ""}`}
        actionHref={`/app/clients/${r.client.id}`}
        actionLabel="Fiche client"
      />
      {sp.toast ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.toast}</p> : null}
      {sp.toast_error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.toast_error}</p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preuve déposée par le client</CardTitle>
            </CardHeader>
            <CardContent>
              {proof ? (
                <>
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[160px_1fr]">
                    <dt className="text-muted2">Déposée le</dt>
                    <dd>{new Date(proof.submittedAt).toLocaleString("fr-FR")}</dd>
                    <dt className="text-muted2">Moyen</dt>
                    <dd>{payMethodLabel(proof.method)}</dd>
                    <dt className="text-muted2">Montant déclaré</dt>
                    <dd className="font-semibold">
                      {r.currency} {proof.amount.toFixed(2)}
                      {amountMismatch ? (
                        <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                          différent du montant demandé
                        </span>
                      ) : null}
                    </dd>
                    <dt className="text-muted2">Date du paiement</dt>
                    <dd>{proof.paidOn}</dd>
                    <dt className="text-muted2">Payeur</dt>
                    <dd>{proof.payerName}</dd>
                    <dt className="text-muted2">Référence</dt>
                    <dd className="font-mono text-xs">{proof.reference || "—"}</dd>
                    {proof.note ? (
                      <>
                        <dt className="text-muted2">Note</dt>
                        <dd>{proof.note}</dd>
                      </>
                    ) : null}
                  </dl>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {files.map((f) =>
                      f.mimeType.startsWith("image/") ? (
                        <a
                          key={f.id}
                          href={`/api/files/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-lg border border-line bg-surface"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/files/${f.id}`} alt={f.name} className="h-44 w-full object-cover" />
                        </a>
                      ) : (
                        <a
                          key={f.id}
                          href={`/api/files/${f.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface text-xs text-muted2 hover:text-electric"
                        >
                          <FileText className="h-6 w-6" /> {f.name}
                        </a>
                      ),
                    )}
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted2">
                  Aucune preuve encore. Lien{" "}
                  {r.viewedAt ? `ouvert le ${r.viewedAt.toLocaleDateString("fr-FR")}` : "pas encore ouvert"},
                  envoyé le {r.createdAt.toLocaleDateString("fr-FR")}
                  {r.sentVia.length
                    ? ` via ${r.sentVia.map((v) => (v === "EMAIL" ? "e-mail" : "WhatsApp")).join(", ")}`
                    : ""}
                  {r.reminderCount ? ` · ${r.reminderCount} rappel(s)` : ""}.
                  <div className="mt-2">
                    <CopyLinkButton url={paymentRequestUrl(r.token)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Traiter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {r.payment ? (
                <p>
                  Paiement{" "}
                  <Link
                    prefetch={false}
                    href={`/app/finance/payments/${r.payment.id}`}
                    className="text-electric hover:underline"
                  >
                    {r.payment.reference}
                  </Link>{" "}
                  · {r.payment.status}
                </p>
              ) : null}
              {r.status === "PROOF_SUBMITTED" &&
              r.payment?.status === "PENDING" &&
              can(user, "PAYMENT_APPROVE") ? (
                <form action={confirmPaymentRequestPayment}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-electric px-3 py-2.5 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4" /> Confirmer le paiement
                  </button>
                  <p className="mt-1 text-[11px] text-muted2">
                    Vérifiez la preuve (montant, date, bénéficiaire) ; la confirmation émet le reçu et informe
                    le client.
                  </p>
                </form>
              ) : null}
              {["SENT", "VIEWED"].includes(r.status) ? (
                <>
                  <form action={remindPaymentRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <button className="w-full rounded-lg border border-line px-3 py-2 hover:bg-surface">
                      Envoyer un rappel
                    </button>
                  </form>
                  <form action={cancelPaymentRequest}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="returnTo" value={here} />
                    <button className="w-full rounded-lg border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50">
                      Annuler la demande
                    </button>
                  </form>
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contexte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted2">
              <div>
                Client :{" "}
                <Link
                  prefetch={false}
                  href={`/app/clients/${r.client.id}`}
                  className="text-electric hover:underline"
                >
                  {r.client.firstName} {r.client.lastName} · {r.client.internalId}
                </Link>
              </div>
              {r.case ? (
                <div>
                  Dossier :{" "}
                  <Link
                    prefetch={false}
                    href={`/app/cases/${r.case.id}`}
                    className="text-electric hover:underline"
                  >
                    {r.case.caseNumber} — {r.case.title}
                  </Link>
                </div>
              ) : null}
              <div>
                Demandé par {r.requestedBy.firstName} {r.requestedBy.lastName} le{" "}
                {r.createdAt.toLocaleDateString("fr-FR")}
              </div>
              {r.allowedMethods.length ? (
                <div>Moyens proposés : {r.allowedMethods.map((m) => payMethodLabel(m)).join(", ")}</div>
              ) : null}
              {r.onlineUrl ? <div className="truncate">Lien en ligne : {r.onlineUrl}</div> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
