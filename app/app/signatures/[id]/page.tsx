import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignatureWorkspaceHeader } from "@/components/app/signature-workspace-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopySigningLink } from "@/components/signatures/copy-signing-link";
import { formatDate, formatDateTime } from "@/lib/utils";
import { mockSignRecipient } from "@/services/signatures";
import { voidTrackedSignatureRequest } from "@/services/signature-actions";
import { sendPreparedSignatureRequest } from "@/services/signature-center";
import { activateJunNativeSigning, sendJunNativeReminder } from "@/services/native-signatures";
import { verifySignerInternally } from "@/services/native-signature-otp";
import {
  cancelNativeSignatureRequest,
  extendSignatureExpiration,
  regenerateSignerLink,
  replacePendingSigner,
  resendSigningInvitation,
} from "@/services/signature-management";
import { nativeSigningExpiry, nativeSigningUrl } from "@/lib/native-signature";
import { signatureRecipients, signatureRequestMeta } from "@/lib/signature-recipients";
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  Mail,
  MapPin,
  Move,
  RefreshCw,
  Send,
  ShieldCheck,
  UserPen,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SignatureDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  if (!can(user, "DOCUMENT_READ")) notFound();

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: { document: { include: { client: true } }, createdBy: true },
  });
  if (!request) notFound();

  const managementHistory = await prisma.auditLog.findMany({
    where: {
      resourceType: "SignatureRequest",
      resourceId: request.id,
      action: { startsWith: "JUN_NATIVE_" },
    },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const meta = signatureRequestMeta(request.recipients);
  const canSign = can(user, "DOCUMENT_SIGN");
  const open = !["SIGNED", "DECLINED", "EXPIRED", "VOIDED"].includes(request.status);
  const nativeActive =
    request.provider === "JUN_NATIVE" && ["SENT", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status);
  const allowMockSign = request.provider === "MOCK" && process.env.NODE_ENV !== "production";
  const docusignReady = Boolean(
    (process.env.SIGNATURE_PROVIDER ?? "").toUpperCase() === "DOCUSIGN" &&
    process.env.DOCUSIGN_CLIENT_ID &&
    process.env.DOCUSIGN_USER_ID &&
    process.env.DOCUSIGN_ACCOUNT_ID &&
    process.env.DOCUSIGN_BASE_PATH &&
    process.env.DOCUSIGN_PRIVATE_KEY,
  );
  const expiresAt = meta.expiresAt
    ? new Date(meta.expiresAt)
    : request.sentAt
      ? nativeSigningExpiry(request.sentAt)
      : null;
  const nativeLinks =
    request.provider === "JUN_NATIVE" && expiresAt && open
      ? await Promise.all(
          recipients.map(async (r) => ({
            email: r.email,
            url: await nativeSigningUrl(request.id, r.email, r.order, expiresAt, r.linkVersion ?? 1),
          })),
        )
      : [];
  const firstUnsigned = recipients.find((r) => !r.signedAt && !r.declinedAt);
  const signedCount = recipients.filter((r) => Boolean(r.signedAt)).length;
  const signedPdfBase = `/api/signatures/${request.id}/signed-pdf`;
  const currentSigner = firstUnsigned ? { name: firstUnsigned.name, email: firstUnsigned.email } : null;

  const headerActions = (
    <>
      <Link href="/app/signatures">
        <Button variant="secondary">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Signatures
        </Button>
      </Link>
      <Link href={`/app/documents/${request.documentId}`}>
        <Button variant="secondary">Ouvrir le document</Button>
      </Link>
      {canSign && request.status === "READY_FOR_SIGNATURE" ? (
        <Link href={`/app/signatures/${request.id}/prepare`}>
          <Button variant="secondary">
            <Move className="mr-1.5 h-4 w-4" />
            Placer les champs
          </Button>
        </Link>
      ) : null}
      {canSign && request.status === "READY_FOR_SIGNATURE" ? (
        <form action={activateJunNativeSigning.bind(null, request.id)}>
          <Button variant="gold">
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            Lancer JUN Secure Sign
          </Button>
        </form>
      ) : null}
      {canSign && request.status === "READY_FOR_SIGNATURE" && docusignReady ? (
        <form action={sendPreparedSignatureRequest.bind(null, request.id)}>
          <Button variant="secondary">
            <Send className="mr-1.5 h-4 w-4" />
            DocuSign
          </Button>
        </form>
      ) : null}
    </>
  );

  return (
    <div>
      <SignatureWorkspaceHeader
        documentDbId={request.documentId}
        registryId={request.document.documentId}
        title={request.document.title}
        status={request.status}
        provider={request.provider}
        client={
          request.document.client
            ? {
                id: request.document.client.id,
                name: `${request.document.client.firstName} ${request.document.client.lastName}`,
              }
            : null
        }
        signedCount={signedCount}
        signerCount={recipients.length}
        currentSigner={currentSigner}
        expiresAt={expiresAt ? formatDateTime(expiresAt) : null}
        actions={headerActions}
      />

      {request.status === "READY_FOR_SIGNATURE" ? (
        <Notice
          tone="amber"
          title="Demande préparée, pas encore envoyée"
          text={`Les signataires et champs PDF sont enregistrés. Lancez JUN Secure Sign${docusignReady ? " ou utilisez DocuSign" : ""} pour démarrer le processus.`}
        />
      ) : null}
      {nativeActive ? (
        <Notice
          tone="emerald"
          title="JUN Secure Sign est actif"
          text={`Routage, invitations automatiques et liens révocables sont activés${expiresAt ? ` · expiration ${formatDateTime(expiresAt)}` : ""}.`}
        />
      ) : null}
      {meta.whatsappDeliveryStatus ? (
        <Notice
          tone={
            meta.whatsappDeliveryStatus === "FAILED"
              ? "red"
              : meta.whatsappDeliveryStatus === "DELIVERED" || meta.whatsappDeliveryStatus === "READ"
                ? "emerald"
                : "amber"
          }
          title={`WhatsApp · ${meta.whatsappDeliveryStatus}`}
          text={
            meta.whatsappDeliveryStatus === "FAILED"
              ? meta.whatsappFailureReason || "Meta a refusé ou n’a pas pu livrer le message."
              : meta.whatsappDeliveryStatus === "READ"
                ? "Le client a reçu et lu l’invitation WhatsApp."
                : meta.whatsappDeliveryStatus === "DELIVERED"
                  ? "L’invitation de signature a été livrée sur le WhatsApp du client."
                  : meta.whatsappDeliveryStatus === "SENT"
                    ? "Meta a envoyé le message vers le téléphone du client; JUN attend la confirmation de livraison."
                    : "Meta a accepté la demande. JUN attend maintenant le statut de livraison réel."
          }
        />
      ) : null}
      {request.status === "DECLINED" ? (
        <Notice
          tone="red"
          title="Signature refusée"
          text="Consultez le motif du signataire avant de créer une nouvelle demande."
        />
      ) : null}
      {request.status === "EXPIRED" ? (
        <Notice
          tone="amber"
          title="Demande expirée"
          text="Créez une nouvelle demande pour générer de nouveaux liens sécurisés."
        />
      ) : null}
      {request.status === "VOIDED" && meta.cancelReason ? (
        <Notice tone="red" title="Demande annulée" text={meta.cancelReason} />
      ) : null}

      {request.status === "SIGNED" && request.signedPdfKey ? (
        <Card className="mb-5 border-emerald-500/20 bg-emerald-500/[0.035]">
          <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 font-semibold text-success">
                <CheckCircle2 className="h-5 w-5" />
                Dossier signé terminé
              </div>
              <p className="mt-1 text-sm text-muted2">
                Le PDF signé et son certificat d’audit sont archivés et protégés par empreinte SHA-256.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={signedPdfBase} target="_blank">
                <Button variant="secondary">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Voir le PDF signé
                </Button>
              </Link>
              <Link href={`${signedPdfBase}?download=1`}>
                <Button variant="secondary">
                  <Download className="mr-1.5 h-4 w-4" />
                  Télécharger
                </Button>
              </Link>
              <Link href={`/api/signatures/${request.id}/certificate`} target="_blank">
                <Button variant="gold">
                  <FileCheck2 className="mr-1.5 h-4 w-4" />
                  Certificat / Audit
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Signataires</CardTitle>
                <p className="mt-1 text-xs text-muted2">
                  Ordre de signature, état, sécurité et champs affectés.
                </p>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-line p-0">
              {recipients.length === 0 ? (
                <p className="p-5 text-sm text-muted2">Aucun signataire enregistré.</p>
              ) : (
                recipients.map((s, index) => {
                  const signingLink = nativeLinks.find(
                    (l) => l.email.toLowerCase() === s.email.toLowerCase(),
                  )?.url;
                  const isCurrent =
                    nativeActive &&
                    !s.signedAt &&
                    !s.declinedAt &&
                    firstUnsigned?.email.toLowerCase() === s.email.toLowerCase();
                  return (
                    <section
                      key={`${s.email}-${index}`}
                      className={isCurrent ? "bg-emerald-500/[0.025] p-5" : "p-5"}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/[0.045] text-xs font-semibold text-ink-2">
                              {s.order}
                            </span>
                            <p className="font-semibold">{s.name}</p>
                            {s.role ? (
                              <span className="rounded-lg border border-line bg-ink/[0.03] px-2 py-1 text-[10px] uppercase tracking-wide text-muted2">
                                {s.role.replaceAll("_", " ")}
                              </span>
                            ) : null}
                            {isCurrent ? (
                              <span className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-success">
                                Signataire actuel
                              </span>
                            ) : null}
                            {s.verifiedAt ? (
                              <span className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-success">
                                Email vérifié
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm text-muted2">
                            {s.email} · lien v{s.linkVersion ?? 1}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted2">
                            {s.invitationSentAt ? (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5" />
                                Invitation {formatDateTime(new Date(s.invitationSentAt))}
                              </span>
                            ) : null}
                            {s.viewedAt ? (
                              <span className="inline-flex items-center gap-1">
                                <Eye className="h-3.5 w-3.5" />
                                Consulté {formatDateTime(new Date(s.viewedAt))}
                              </span>
                            ) : null}
                            {s.otpSentAt ? (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5" />
                                OTP {formatDateTime(new Date(s.otpSentAt))}
                              </span>
                            ) : null}
                            {s.verifiedAt ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Vérifié {formatDateTime(new Date(s.verifiedAt))}
                              </span>
                            ) : null}
                            {s.reminderSentAt ? (
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3.5 w-3.5" />
                                Rappel {formatDateTime(new Date(s.reminderSentAt))}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {s.signedAt ? (
                            <span className="inline-flex items-center gap-2 text-sm font-medium text-success">
                              <CheckCircle2 className="h-4 w-4" />
                              Signé {formatDateTime(new Date(s.signedAt))}
                            </span>
                          ) : s.declinedAt ? (
                            <span className="inline-flex items-center gap-2 text-sm font-medium text-danger">
                              <XCircle className="h-4 w-4" />
                              Refusé
                            </span>
                          ) : canSign && open && allowMockSign ? (
                            <form action={mockSignRecipient.bind(null, request.id, index)}>
                              <Button variant="gold" size="sm">
                                Mock sign
                              </Button>
                            </form>
                          ) : (
                            <StatusBadge
                              status={
                                request.status === "READY_FOR_SIGNATURE"
                                  ? "READY"
                                  : isCurrent
                                    ? "WAITING_CLIENT"
                                    : "PENDING"
                              }
                            />
                          )}
                        </div>
                      </div>

                      {s.declineReason ? (
                        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-sm text-danger">
                          <strong>Motif :</strong> {s.declineReason}
                        </div>
                      ) : null}

                      {(s.fields ?? []).length ? (
                        <div className="mt-4">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-2">
                            Champs PDF
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(s.fields ?? []).map((f, fieldIndex) => (
                              <span
                                key={`${f.type}-${fieldIndex}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-line bg-ink/[0.025] px-2.5 py-1.5 text-xs text-muted2"
                              >
                                <MapPin className="h-3 w-3" />
                                {f.type.replaceAll("_", " ")} · page {f.page}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {nativeActive && !s.signedAt && !s.declinedAt && canSign ? (
                        <div className="mt-4 rounded-xl border border-line bg-black/[0.08] p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {signingLink ? (
                              <>
                                <CopySigningLink url={signingLink} />
                                <Link href={signingLink} target="_blank">
                                  <Button size="sm" variant="secondary">
                                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                                    Ouvrir
                                  </Button>
                                </Link>
                              </>
                            ) : null}
                            {isCurrent ? (
                              <form action={resendSigningInvitation.bind(null, request.id, s.email)}>
                                <Button size="sm" variant="secondary">
                                  <Mail className="mr-1 h-3.5 w-3.5" />
                                  Renvoyer
                                </Button>
                              </form>
                            ) : null}
                            {isCurrent ? (
                              <form action={sendJunNativeReminder.bind(null, request.id, s.email)}>
                                <Button size="sm" variant="gold">
                                  <Mail className="mr-1 h-3.5 w-3.5" />
                                  Rappel
                                </Button>
                              </form>
                            ) : null}
                            {isCurrent ? (
                              <form action={regenerateSignerLink.bind(null, request.id, s.email)}>
                                <Button size="sm" variant="secondary">
                                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                                  Révoquer + nouveau lien
                                </Button>
                              </form>
                            ) : null}
                          </div>
                          {isCurrent && !s.verifiedAt ? (
                            <details className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
                              <summary className="cursor-pointer text-xs font-semibold text-warning">
                                <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
                                Vérification interne
                              </summary>
                              <p className="mt-2 text-xs text-muted2">
                                Utilisez uniquement après avoir contrôlé l’identité du client par un autre
                                moyen fiable. Cette action contourne le code OTP et est enregistrée dans
                                l’audit.
                              </p>
                              <form
                                action={verifySignerInternally.bind(null, request.id, s.order)}
                                className="mt-3"
                              >
                                <textarea
                                  name="reason"
                                  required
                                  minLength={5}
                                  maxLength={500}
                                  rows={2}
                                  className="w-full rounded-lg border border-amber-500/20 bg-white px-3 py-2 text-sm text-night"
                                  placeholder="Ex. Identité confirmée lors d’un appel vidéo avec pièce d’identité"
                                />
                                <Button type="submit" size="sm" variant="gold" className="mt-2">
                                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                                  Confirmer l’identité en interne
                                </Button>
                              </form>
                            </details>
                          ) : null}
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-electric">
                              <UserPen className="mr-1 inline h-3.5 w-3.5" />
                              Modifier / remplacer le signataire
                            </summary>
                            <form
                              action={replacePendingSigner.bind(null, request.id, s.order)}
                              className="mt-3 grid gap-2 sm:grid-cols-3"
                            >
                              <input
                                name="name"
                                defaultValue={s.name}
                                required
                                className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-night"
                                placeholder="Nom"
                              />
                              <input
                                name="email"
                                type="email"
                                defaultValue={s.email}
                                required
                                className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-night"
                                placeholder="Email"
                              />
                              <input
                                name="role"
                                defaultValue={s.role ?? ""}
                                className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-night"
                                placeholder="Rôle"
                              />
                              <div className="sm:col-span-3">
                                <Button size="sm" variant="secondary" type="submit">
                                  Enregistrer
                                </Button>
                              </div>
                            </form>
                          </details>
                        </div>
                      ) : null}
                    </section>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Chronologie</CardTitle>
                <p className="mt-1 text-xs text-muted2">Étapes importantes de la demande de signature.</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0 border-l border-line pl-5">
                {timelineRows(request, recipients, expiresAt).map((row, index) => (
                  <div key={`${row.label}-${index}`} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-blue-400 ring-4 ring-[#101827]" />
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="mt-0.5 text-xs text-muted2">{row.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {managementHistory.length ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Historique de gestion</CardTitle>
                  <p className="mt-1 text-xs text-muted2">
                    Les événements OTP indiquent l’expéditeur, le destinataire, le résultat et les tentatives.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-line p-0">
                {managementHistory.map((log) => {
                  const details = auditDetails(log.after);
                  return (
                    <div key={log.id} className="px-5 py-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`font-semibold ${historyTone(log.action)}`}>
                          {historyLabel(log.action)}
                        </span>
                        <span className="text-xs text-muted2">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted2">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : "Système / signataire"}
                      </p>
                      {details.length ? (
                        <div className="mt-3 grid gap-2 rounded-xl border border-line bg-ink/[0.02] p-3 text-xs sm:grid-cols-2">
                          {details.map((item) => (
                            <div key={item.label} className="min-w-0">
                              <span className="text-muted2">{item.label}</span>
                              <p className="mt-0.5 break-words font-medium text-ink">{item.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Contrôle de la demande</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Info label="Statut" value={<StatusBadge status={request.status} />} />
              <Info label="Provider" value={request.provider} />
              <Info label="Signataires" value={`${signedCount}/${recipients.length} signés`} />
              <Info
                label="Champs"
                value={String(recipients.reduce((n, r) => n + (r.fields?.length ?? 0), 0))}
              />
              <Info label="Créée" value={formatDate(request.createdAt)} />
              <Info
                label="Créée par"
                value={`${request.createdBy.firstName} ${request.createdBy.lastName}`}
              />
              {expiresAt ? <Info label="Expiration" value={formatDateTime(expiresAt)} /> : null}
              {meta.whatsappDeliveryStatus ? (
                <Info label="WhatsApp" value={meta.whatsappDeliveryStatus} />
              ) : null}
              {meta.whatsappDeliveryMode ? (
                <Info
                  label="Canal WhatsApp"
                  value={
                    meta.whatsappDeliveryMode === "APPROVED_TEMPLATE" ||
                    meta.whatsappDeliveryMode === "APPROVED_TEMPLATE_DOCUMENT"
                      ? "Template approuvé"
                      : "Texte libre"
                  }
                />
              ) : null}
              {meta.whatsappDeliveryUpdatedAt ? (
                <Info label="MAJ WhatsApp" value={formatDateTime(new Date(meta.whatsappDeliveryUpdatedAt))} />
              ) : null}
              {meta.whatsappFailureReason ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.05] p-3 text-xs text-danger">
                  <strong>Échec WhatsApp</strong>
                  <p className="mt-1 text-red-200/80">{meta.whatsappFailureReason}</p>
                </div>
              ) : null}
              {request.signedPdfHash ? (
                <div className="border-t border-line pt-3">
                  <p className="text-xs text-muted2">Empreinte PDF signé</p>
                  <p className="registry-id mt-1 break-all text-[10px]">{request.signedPdfHash}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Document officiel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Link
                href={`/app/documents/${request.documentId}`}
                className="registry-id font-medium hover:text-electric"
              >
                {request.document.documentId}
              </Link>
              <p className="text-muted2">{request.document.title}</p>
              {request.document.client ? (
                <Link
                  href={`/app/clients/${request.document.clientId}/dashboard`}
                  className="block text-sm hover:text-electric"
                >
                  {request.document.client.firstName} {request.document.client.lastName}
                </Link>
              ) : null}
              <Link
                href={`/verify/${request.document.documentId}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-success hover:text-success"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Vérification publique
              </Link>
            </CardContent>
          </Card>

          {meta.message ? (
            <Card>
              <CardHeader>
                <CardTitle>Message au signataire</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted2">{meta.message}</p>
              </CardContent>
            </Card>
          ) : null}

          {nativeActive && canSign ? (
            <Card>
              <CardHeader>
                <CardTitle>Gestion sécurisée</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <form action={extendSignatureExpiration.bind(null, request.id)}>
                  <label className="text-sm font-medium">Prolonger l’expiration</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      name="days"
                      type="number"
                      min={1}
                      max={30}
                      defaultValue={7}
                      required
                      className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm text-night"
                    />
                    <Button type="submit" size="sm" variant="secondary">
                      <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                      Prolonger
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted2">
                    1 à 30 jours supplémentaires avec nouvelle invitation.
                  </p>
                </form>
                <div className="border-t border-line pt-4">
                  <form action={cancelNativeSignatureRequest.bind(null, request.id)}>
                    <label className="text-sm font-medium text-danger">Annuler la demande</label>
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-red-500/20 bg-white px-3 py-2 text-sm text-night"
                      placeholder="Motif d’annulation"
                    />
                    <Button type="submit" size="sm" variant="danger" className="mt-2">
                      <Ban className="mr-1 h-3.5 w-3.5" />
                      Annuler et révoquer
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ) : canSign && open && !nativeActive ? (
            <Card>
              <CardContent className="p-4">
                {request.status !== "READY_FOR_SIGNATURE" ? (
                  <form action={voidTrackedSignatureRequest.bind(null, request.id)}>
                    <Button variant="danger" className="w-full">
                      Annuler la demande
                    </Button>
                  </form>
                ) : (
                  <p className="text-xs text-muted2">
                    Lancez JUN Secure Sign pour activer les outils de gestion avancés.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Notice({ tone, title, text }: { tone: "amber" | "emerald" | "red"; title: string; text: string }) {
  const cls =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/[0.05] text-success"
      : tone === "red"
        ? "border-red-500/20 bg-red-500/[0.05] text-danger"
        : "border-amber-500/20 bg-amber-500/[0.05] text-warning";
  return (
    <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      <strong>{title}.</strong>
      <span className="ml-1 text-muted2">{text}</span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted2">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function historyLabel(action: string) {
  const labels: Record<string, string> = {
    JUN_NATIVE_OTP_SENT: "OTP ENVOYÉ",
    JUN_NATIVE_OTP_FAILED: "OTP INCORRECT",
    JUN_NATIVE_OTP_LOCKED: "OTP VERROUILLÉ",
    JUN_NATIVE_OTP_DELIVERY_FAILED: "ÉCHEC ENVOI OTP",
    JUN_NATIVE_SIGNER_EMAIL_VERIFIED: "EMAIL VÉRIFIÉ",
    JUN_NATIVE_SIGNER_VERIFIED_INTERNAL: "VÉRIFICATION INTERNE",
  };
  return labels[action] ?? action.replaceAll("JUN_NATIVE_", "").replaceAll("_", " ");
}

function historyTone(action: string) {
  if (action.includes("FAILED") || action.includes("LOCKED") || action.includes("DELIVERY_FAILED"))
    return "text-danger";
  if (action.includes("VERIFIED") || action.includes("OTP_SENT")) return "text-success";
  return "text-ink";
}

function auditDetails(value: unknown): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const data = value as Record<string, unknown>;
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, key: string) => {
    const v = data[key];
    if (v !== undefined && v !== null && String(v).trim()) rows.push({ label, value: String(v) });
  };
  add("Expéditeur", "fromEmail");
  add("Destinataire", "recipientEmail");
  add("Statut Gmail", "providerStatus");
  add("Méthode", "verificationMethod");
  add("Tentatives", "attempts");
  add("Tentatives restantes", "attemptsRemaining");
  add("Motif", "reason");
  add("Vérifié par", "verifiedBy");
  add("Erreur", "error");
  if (data.expiresAt)
    rows.push({ label: "Expiration OTP", value: formatDateTime(new Date(String(data.expiresAt))) });
  if (data.verifiedAt)
    rows.push({ label: "Vérifié le", value: formatDateTime(new Date(String(data.verifiedAt))) });
  return rows;
}

function timelineRows(
  request: any,
  recipients: ReturnType<typeof signatureRecipients>,
  expiresAt: Date | null,
) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Demande créée", value: formatDateTime(request.createdAt) },
  ];
  if (request.sentAt)
    rows.push({ label: "Demande activée / envoyée", value: formatDateTime(request.sentAt) });
  for (const s of recipients)
    if (s.invitationSentAt)
      rows.push({
        label: `Invitation envoyée à ${s.name}`,
        value: formatDateTime(new Date(s.invitationSentAt)),
      });
  for (const s of recipients)
    if (s.otpSentAt)
      rows.push({ label: `OTP envoyé à ${s.name}`, value: formatDateTime(new Date(s.otpSentAt)) });
  for (const s of recipients)
    if (s.verifiedAt)
      rows.push({ label: `Identité vérifiée · ${s.name}`, value: formatDateTime(new Date(s.verifiedAt)) });
  for (const s of recipients)
    if (s.viewedAt)
      rows.push({ label: `Document consulté par ${s.name}`, value: formatDateTime(new Date(s.viewedAt)) });
  for (const s of recipients)
    if (s.signedAt) rows.push({ label: `Signé par ${s.name}`, value: formatDateTime(new Date(s.signedAt)) });
  for (const s of recipients)
    if (s.declinedAt)
      rows.push({ label: `Refusé par ${s.name}`, value: formatDateTime(new Date(s.declinedAt)) });
  if (request.completedAt)
    rows.push({ label: "Processus clôturé", value: formatDateTime(request.completedAt) });
  if (expiresAt && !request.completedAt)
    rows.push({ label: "Expiration prévue", value: formatDateTime(expiresAt) });
  return rows;
}
