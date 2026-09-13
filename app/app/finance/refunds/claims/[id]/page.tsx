import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, XCircle } from "lucide-react";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reasonLabel, payoutLabel, claimUrl, type ClaimDetails } from "@/lib/refund-claims";
import { markClaimUnderReview, rejectClaim } from "@/services/refund-claims";
import { CopyLinkButton } from "@/components/app/copy-link-button";

export const dynamic = "force-dynamic";

const STATUS_FR: Record<string, string> = {
  SENT: "Lien envoyé, en attente du client",
  SUBMITTED: "Soumise — à examiner",
  UNDER_REVIEW: "En cours d’examen",
  CONVERTED: "Acceptée — remboursement créé",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
  CANCELLED: "Annulée",
};

export default async function RefundClaimPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ toast?: string; toast_error?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const user = await requireUser();
  if (!can(user, "REFUND_READ")) redirect("/app/forbidden");
  const c = await prisma.refundClaim.findUnique({
    where: { id },
    include: {
      client: {
        select: { id: true, firstName: true, lastName: true, internalId: true, email: true, phone: true },
      },
      payment: { select: { id: true, reference: true, amount: true, currency: true, createdAt: true } },
      case: { select: { id: true, caseNumber: true, title: true } },
      refund: { select: { id: true, refundNumber: true, status: true } },
      requestedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!c) notFound();
  const files = c.fileIds.length
    ? await prisma.file.findMany({
        where: { id: { in: c.fileIds } },
        select: { id: true, name: true, mimeType: true },
      })
    : [];
  const details = (c.payoutDetails ?? {}) as Record<string, string>;
  const sub = (c.submission ?? {}) as Partial<ClaimDetails>;
  const fileById = new Map(files.map((f) => [f.id, f]));
  const byRole = (role: string) =>
    (sub.files ?? [])
      .filter((f) => f.role === role)
      .map((f) => ({ ...f, mime: fileById.get(f.fileId)?.mimeType ?? "" }));
  const ID_LABEL: Record<string, string> = {
    PASSPORT: "Passeport",
    NATIONAL_ID: "Carte d’identité",
    DRIVER_LICENSE: "Permis de conduire",
    RESIDENCE_PERMIT: "Titre de séjour",
  };
  const METHOD_LABEL: Record<string, string> = {
    CASH: "Espèces en agence",
    BANK_TRANSFER: "Virement",
    CARD: "Carte",
    ZELLE: "Zelle",
    PAYPAL: "PayPal",
    MONCASH: "MonCash / mobile money",
    WESTERN_UNION: "Western Union / MoneyGram",
    OTHER: "Autre",
  };
  const SERVICE_LABEL: Record<string, string> = {
    VISA: "Visa / immigration",
    TRAVEL: "Voyage / billet / hôtel",
    DOCUMENTS: "Documents / démarches",
    DESIGN: "Création / design",
    OTHER: "Autre",
  };
  const Thumb = ({ f }: { f: { fileId: string; name: string; mime: string } }) =>
    f.mime.startsWith("image/") ? (
      <a
        href={`/api/files/${f.fileId}`}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg border border-line bg-surface"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/files/${f.fileId}`} alt={f.name} className="h-40 w-full object-cover" />
        <div className="truncate px-2 py-1 text-[11px] text-muted2">{f.name}</div>
      </a>
    ) : (
      <a
        href={`/api/files/${f.fileId}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-line bg-surface text-xs text-muted2 hover:text-electric"
      >
        <FileText className="h-6 w-6" />
        <span className="max-w-[90%] truncate px-2">{f.name}</span>
      </a>
    );
  const open = ["SUBMITTED", "UNDER_REVIEW"].includes(c.status);
  const canDecide = can(user, "REFUND_APPROVE") || can(user, "REFUND_CREATE");
  const createHref = `/app/finance/refunds/new?clientId=${c.clientId}${c.paymentId ? `&paymentId=${c.paymentId}` : ""}${c.caseId ? `&caseId=${c.caseId}` : ""}&amount=${c.amount ? Number(c.amount) : ""}&reason=${encodeURIComponent(`${reasonLabel(c.reasonCode)} — ${c.reason ?? ""}`)}&claimId=${c.id}`;

  return (
    <div className="space-y-5">
      <Link
        prefetch={false}
        href="/app/finance/refunds"
        className="inline-flex items-center gap-1 text-xs text-muted2 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Remboursements
      </Link>
      <PageHeader
        eyebrow="Demande client"
        title={`${c.client.firstName} ${c.client.lastName} — ${c.currency ?? ""} ${c.amount ? Number(c.amount).toFixed(2) : "—"}`}
        subtitle={STATUS_FR[c.status] ?? c.status}
        actionHref={`/app/clients/${c.client.id}`}
        actionLabel="Fiche client"
      />
      {sp.toast ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.toast}</p> : null}
      {sp.toast_error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.toast_error}</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {c.submittedAt && sub.identity ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1. Identité déclarée</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[160px_1fr]">
                  <dt className="text-muted2">Nom complet</dt>
                  <dd className="font-medium">{sub.identity.fullName}</dd>
                  <dt className="text-muted2">Date de naissance</dt>
                  <dd>{sub.identity.dateOfBirth}</dd>
                  <dt className="text-muted2">Pièce</dt>
                  <dd>
                    {ID_LABEL[sub.identity.idType] ?? sub.identity.idType} ·{" "}
                    <span className="font-mono">{sub.identity.idNumber}</span>
                  </dd>
                  <dt className="text-muted2">Fiche client</dt>
                  <dd>
                    {c.client.firstName} {c.client.lastName} · {c.client.internalId}
                    {sub.identity.fullName.toLowerCase().replace(/\s+/g, " ") !==
                    `${c.client.firstName} ${c.client.lastName}`.toLowerCase().replace(/\s+/g, " ") ? (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                        nom différent de la fiche
                      </span>
                    ) : (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                        cohérent
                      </span>
                    )}
                  </dd>
                </dl>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted2">Pièce d’identité</div>
                    <div className="grid gap-2">
                      {byRole("ID").map((f) => (
                        <Thumb key={f.fileId} f={f} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted2">Selfie avec la pièce</div>
                    <div className="grid gap-2">
                      {byRole("SELFIE").map((f) => (
                        <Thumb key={f.fileId} f={f} />
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {c.submittedAt && sub.payment ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Paiement déclaré et preuve</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[160px_1fr]">
                  <dt className="text-muted2">Payé le</dt>
                  <dd>{sub.payment.paidOn}</dd>
                  <dt className="text-muted2">Montant payé</dt>
                  <dd className="font-medium">
                    {sub.payment.currency} {Number(sub.payment.paidAmount).toFixed(2)}
                  </dd>
                  <dt className="text-muted2">Moyen</dt>
                  <dd>{METHOD_LABEL[sub.payment.method] ?? sub.payment.method}</dd>
                  <dt className="text-muted2">Référence</dt>
                  <dd className="font-mono text-xs">{sub.payment.reference || "—"}</dd>
                  <dt className="text-muted2">Payé à</dt>
                  <dd>{sub.payment.paidTo}</dd>
                  <dt className="text-muted2">Dans nos registres</dt>
                  <dd>
                    {c.payment ? (
                      <>
                        <Link
                          prefetch={false}
                          href={`/app/finance/payments/${c.payment.id}`}
                          className="text-electric hover:underline"
                        >
                          {c.payment.reference} · {c.payment.currency} {Number(c.payment.amount).toFixed(2)}
                        </Link>
                        {Math.abs(Number(c.payment.amount) - Number(sub.payment.paidAmount)) > 0.005 ? (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                            montant déclaré différent
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">
                        aucun paiement enregistré — à rapprocher manuellement
                      </span>
                    )}
                  </dd>
                </dl>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted2">Preuves de paiement</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {byRole("PAYMENT_PROOF").map((f) => (
                      <Thumb key={f.fileId} f={f} />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {c.submittedAt && sub.service ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Service concerné</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[160px_1fr]">
                  <dt className="text-muted2">Type</dt>
                  <dd>{SERVICE_LABEL[sub.service.type] ?? sub.service.type}</dd>
                  <dt className="text-muted2">Description</dt>
                  <dd className="whitespace-pre-wrap">{sub.service.description}</dd>
                  {sub.service.caseReference ? (
                    <>
                      <dt className="text-muted2">Dossier indiqué</dt>
                      <dd>{sub.service.caseReference}</dd>
                    </>
                  ) : null}
                  {sub.service.date ? (
                    <>
                      <dt className="text-muted2">Date du service</dt>
                      <dd>{sub.service.date}</dd>
                    </>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {c.submittedAt && sub.identity ? "4. Motif et montant" : "Demande"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {c.submittedAt ? (
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[160px_1fr]">
                  <dt className="text-muted2">Soumise le</dt>
                  <dd>{c.submittedAt.toLocaleString("fr-FR")}</dd>
                  <dt className="text-muted2">Paiement</dt>
                  <dd>
                    {c.payment ? (
                      <Link
                        prefetch={false}
                        href={`/app/finance/payments/${c.payment.id}`}
                        className="text-electric hover:underline"
                      >
                        {c.payment.reference} · {c.payment.currency} {Number(c.payment.amount).toFixed(2)} ·{" "}
                        {c.payment.createdAt.toLocaleDateString("fr-FR")}
                      </Link>
                    ) : (
                      "Non précisé"
                    )}
                  </dd>
                  <dt className="text-muted2">Montant demandé</dt>
                  <dd className="font-semibold">
                    {c.currency} {Number(c.amount).toFixed(2)}
                  </dd>
                  <dt className="text-muted2">Motif</dt>
                  <dd>{reasonLabel(c.reasonCode)}</dd>
                  <dt className="text-muted2">Explications</dt>
                  <dd className="whitespace-pre-wrap">{c.reason}</dd>
                  <dt className="text-muted2">Mode de remboursement</dt>
                  <dd>
                    {payoutLabel(c.payoutMethod)}
                    {c.payoutMethod === "BANK_TRANSFER" ? (
                      <div className="mt-1 rounded-lg bg-surface p-2 text-xs">
                        {details.bankHolder} · {details.bankName} ·{" "}
                        <span className="font-mono">{details.bankAccount}</span>
                        {details.bankSwift ? ` · ${details.bankSwift}` : ""}
                        {details.bankCountry ? ` · ${details.bankCountry}` : ""}
                      </div>
                    ) : details.other ? (
                      <div className="mt-1 text-xs text-muted2">{details.other}</div>
                    ) : null}
                  </dd>
                  <dt className="text-muted2">Contact</dt>
                  <dd>
                    {c.contactEmail}
                    {c.contactPhone ? ` · ${c.contactPhone}` : ""}
                  </dd>
                  <dt className="text-muted2">Justificatifs</dt>
                  <dd>
                    {files.length ? (
                      <ul className="space-y-1">
                        {files.map((f) => (
                          <li key={f.id}>
                            <a
                              href={`/api/files/${f.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-electric hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" /> {f.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "Aucun"
                    )}
                  </dd>
                </dl>
              ) : (
                <div className="text-sm text-muted2">
                  Le client n’a pas encore rempli le formulaire. Lien envoyé le{" "}
                  {c.createdAt.toLocaleDateString("fr-FR")}
                  {c.sentVia.length
                    ? ` via ${c.sentVia.map((v) => (v === "EMAIL" ? "e-mail" : "WhatsApp")).join(", ")}`
                    : ""}
                  , valable jusqu’au {c.expiresAt.toLocaleDateString("fr-FR")}.
                  <div className="mt-2">
                    <CopyLinkButton url={claimUrl(c.token)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          {c.decisionNote || c.refund ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Décision</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {c.refund ? (
                  <p>
                    Remboursement{" "}
                    <Link
                      prefetch={false}
                      href={`/app/finance/refunds/${c.refund.id}`}
                      className="text-electric hover:underline"
                    >
                      {c.refund.refundNumber}
                    </Link>{" "}
                    · {c.refund.status}
                  </p>
                ) : null}
                {c.decisionNote ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted2">{c.decisionNote}</p>
                ) : null}
                {c.decidedAt ? (
                  <p className="mt-1 text-xs text-muted2">{c.decidedAt.toLocaleString("fr-FR")}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {open && canDecide ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Traiter</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Link
                  prefetch={false}
                  href={createHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-electric px-3 py-2.5 text-sm font-medium text-white"
                >
                  <CheckCircle2 className="h-4 w-4" /> Accepter → créer le remboursement
                </Link>
                <p className="text-[11px] text-muted2">
                  Ouvre le formulaire de remboursement pré-rempli (client, paiement, montant, motif) avec les
                  contrôles habituels de solde ; la demande sera clôturée et le client informé.
                </p>
                {c.status === "SUBMITTED" ? (
                  <form action={markClaimUnderReview}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="w-full rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface">
                      Marquer « en cours d’examen »
                    </button>
                  </form>
                ) : null}
                {can(user, "REFUND_APPROVE") ? (
                  <form action={rejectClaim} className="space-y-2 border-t border-line pt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="Motif du refus (envoyé au client)…"
                      className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-electric"
                    />
                    <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50">
                      <XCircle className="h-4 w-4" /> Refuser et informer le client
                    </button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contexte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted2">
              <div>
                Client :{" "}
                <Link
                  prefetch={false}
                  href={`/app/clients/${c.client.id}`}
                  className="text-electric hover:underline"
                >
                  {c.client.firstName} {c.client.lastName} · {c.client.internalId}
                </Link>
              </div>
              {c.case ? (
                <div>
                  Dossier :{" "}
                  <Link
                    prefetch={false}
                    href={`/app/cases/${c.case.id}`}
                    className="text-electric hover:underline"
                  >
                    {c.case.caseNumber} — {c.case.title}
                  </Link>
                </div>
              ) : null}
              <div>
                Lien créé par {c.requestedBy.firstName} {c.requestedBy.lastName} le{" "}
                {c.createdAt.toLocaleDateString("fr-FR")}
              </div>
              {c.clientIp ? <div>IP de soumission : {c.clientIp}</div> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
