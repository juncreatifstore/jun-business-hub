"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { assertPermission, can } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { nextNumber } from "@/lib/sequence";
import { sha256 } from "@/lib/hash";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { getDrivePublicSecurity, PUBLIC_TOKEN_PREFIX, PUBLIC_DISABLED_PREFIX } from "@/lib/drive-public-security";
import { getClientBlock, saveClientBlock } from "@/lib/client-transaction-block";
import { getClientTermination, getClientTerminationReadiness, saveClientTermination } from "@/lib/client-relationship-termination";
import { storage } from "@/lib/storage";

const BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://www.juncreatif.org").replace(/\/$/, "");
const CONFIDENTIAL_CATEGORIES = ["IDENTITY", "PASSPORT", "VISA"] as const;

function relationshipPath(clientId: string, message?: string, error = false) {
  const base = `/app/clients/${clientId}/relationship`;
  return message ? `${base}?${error ? "toast_error" : "toast"}=${encodeURIComponent(message)}` : base;
}

function refresh(clientId: string) {
  revalidatePath(`/app/clients/${clientId}/dashboard`);
  revalidatePath(`/app/clients/${clientId}/relationship`);
  revalidatePath(`/app/clients/${clientId}/statement`);
  revalidatePath(`/app/clients/${clientId}/documents`);
  revalidatePath("/app/documents");
}

function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: Date | null | undefined) {
  return (value || new Date()).toISOString().slice(0, 10);
}

async function evidenceUrl(fileId: string) {
  const security = await getDrivePublicSecurity(fileId);
  if (security.disabled) return null;
  let token = security.token;
  if (!token) {
    token = randomBytes(24).toString("hex");
    await prisma.appSetting.upsert({
      where: { key: `${PUBLIC_TOKEN_PREFIX}${fileId}` },
      create: { key: `${PUBLIC_TOKEN_PREFIX}${fileId}`, value: token },
      update: { value: token },
    });
  }
  await prisma.appSetting.deleteMany({ where: { key: `${PUBLIC_DISABLED_PREFIX}${fileId}` } });
  return `${BASE}/view/file/${fileId}?key=${encodeURIComponent(token)}`;
}

function proofLines(files: { id: string; name: string }[], urls: Map<string, string | null>) {
  if (!files.length) return `<li><strong>Preuve :</strong> aucune pièce Drive liée à cette opération au moment de l’émission.</li>`;
  return files.map((f) => {
    const url = urls.get(f.id);
    return url
      ? `<li><strong>Preuve :</strong> ${f.name}<br/>Accès sécurisé : ${url}</li>`
      : `<li><strong>Preuve :</strong> ${f.name} — accès externe désactivé; disponible auprès de JUN sur demande autorisée.</li>`;
  }).join("");
}

export async function createOfficialFinalNotice(clientId: string) {
  const user = await assertPermission("DOCUMENT_CREATE");
  if (!can(user, "CLIENT_READ")) redirect(relationshipPath(clientId, "CLIENT_READ permission is required.", true));

  const [client, workflow] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      include: {
        payments: {
          where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
          orderBy: { createdAt: "asc" },
          include: { files: { where: { archivedAt: null, isVault: false }, select: { id: true, name: true } } },
        },
        refunds: {
          where: { status: { notIn: ["REJECTED", "CANCELLED"] } },
          orderBy: { createdAt: "asc" },
          include: {
            installments: { orderBy: { number: "asc" } },
            files: { where: { archivedAt: null, isVault: false }, select: { id: true, name: true } },
          },
        },
      },
    }),
    getClientTermination(clientId),
  ]);
  if (!client) redirect("/app/clients?toast_error=Client%20not%20found");
  if (!workflow || ["CANCELLED", "TERMINATED"].includes(workflow.status)) redirect(relationshipPath(clientId, "Start a termination review before creating the final notice.", true));

  const evidenceFiles = [...client.payments.flatMap((p) => p.files), ...client.refunds.flatMap((r) => r.files)];
  const uniqueFiles = [...new Map(evidenceFiles.map((f) => [f.id, f])).values()];
  const urls = new Map<string, string | null>();
  for (const file of uniqueFiles) urls.set(file.id, await evidenceUrl(file.id));

  const paymentTotals = new Map<string, number>();
  for (const p of client.payments) paymentTotals.set(p.currency, (paymentTotals.get(p.currency) || 0) + Number(p.amount));

  const refundRows = client.refunds.map((r) => {
    const paid = r.installments.filter((i) => i.status === "PAID").reduce((sum, i) => sum + Number(i.amount), 0);
    const remaining = Math.max(0, Number(r.amount) - paid);
    const paidDates = r.installments.filter((i) => i.status === "PAID" && i.paidAt).map((i) => date(i.paidAt));
    return { refund: r, paid, remaining, paidDates };
  });
  const paidRefunds = refundRows.filter((r) => r.paid > 0.005);
  const pendingRefunds = refundRows.filter((r) => r.remaining > 0.005 && ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"].includes(r.refund.status));

  const remainingByCurrency = new Map<string, number>();
  for (const r of pendingRefunds) remainingByCurrency.set(r.refund.currency, (remainingByCurrency.get(r.refund.currency) || 0) + r.remaining);

  const paymentHtml = client.payments.length ? client.payments.map((p) => `
    <h2>${p.reference} — ${money(Number(p.amount), p.currency)}</h2>
    <ul>
      <li>Date de réception : ${date(p.paidAt || p.createdAt)}</li>
      <li>Statut comptable actuel : ${p.status.replaceAll("_", " ")}</li>
      ${proofLines(p.files, urls)}
    </ul>`).join("") : `<p>Aucun paiement historiquement confirmé n’a été trouvé dans le registre du client.</p>`;

  const paidRefundHtml = paidRefunds.length ? paidRefunds.map(({ refund, paid, paidDates }) => `
    <h2>${refund.refundNumber} — ${money(paid, refund.currency)} remboursé</h2>
    <ul>
      <li>Montant initial du remboursement : ${money(Number(refund.amount), refund.currency)}</li>
      <li>Date(s) de paiement : ${paidDates.join(", ") || "enregistrée(s) dans le système"}</li>
      <li>Statut : ${refund.status.replaceAll("_", " ")}</li>
      ${proofLines(refund.files, urls)}
    </ul>`).join("") : `<p>Aucun remboursement n’est actuellement enregistré comme effectivement payé.</p>`;

  const pendingRefundHtml = pendingRefunds.length ? pendingRefunds.map(({ refund, remaining }) => `
    <h2>${refund.refundNumber} — reste dû ${money(remaining, refund.currency)}</h2>
    <ul>
      <li>Montant demandé : ${money(Number(refund.amount), refund.currency)}</li>
      <li>Statut : ${refund.status.replaceAll("_", " ")}</li>
      ${proofLines(refund.files, urls)}
    </ul>`).join("") : `<p>Aucun remboursement supplémentaire n’est actuellement dû selon les écritures actives.</p>`;

  const paymentTotalText = [...paymentTotals.entries()].map(([c, a]) => money(a, c)).join(" · ") || "0.00";
  const remainingText = [...remainingByCurrency.entries()].map(([c, a]) => money(a, c)).join(" · ") || "0.00";
  const issueDate = date(new Date());

  const html = sanitizeDocumentHtml(`
    <h1>AVIS OFFICIEL ET DÉFINITIF DE FIN DE RELATION COMMERCIALE</h1>
    <p><strong>Date d’émission :</strong> ${issueDate}</p>
    <p><strong>Destinataire :</strong> ${client.firstName} ${client.lastName} — ${client.internalId}</p>
    <p><strong>Émetteur :</strong> JUN CREATIF AND TRAVEL LLC</p>

    <h2>1. Objet et caractère définitif de la décision</h2>
    <p>JUN CREATIF AND TRAVEL LLC informe officiellement le client de sa décision de mettre fin à la relation commerciale et à toute collaboration future. Cette décision est prise à l’issue d’un examen interne du dossier. Elle est définitive dans le cadre des procédures internes de JUN et ne fait l’objet d’aucun appel ni réexamen interne, sans préjudice des droits qui ne peuvent légalement être écartés.</p>

    <h2>2. Situation financière vérifiée</h2>
    <p>Les écritures ci-dessous proviennent directement du registre financier de JUN Business Hub. Total historique des paiements confirmés : <strong>${paymentTotalText}</strong>.</p>
    ${paymentHtml}

    <h2>3. Remboursements déjà effectués</h2>
    <p>Les montants ci-dessous sont uniquement ceux dont le paiement est enregistré comme effectué dans le système.</p>
    ${paidRefundHtml}

    <h2>4. Montants restant à rembourser</h2>
    <p>À la date du présent avis, le montant restant à verser au client est : <strong>${remainingText}</strong>. Tout remboursement restant suivra le workflow officiel de JUN jusqu’à son enregistrement comme PAID.</p>
    ${pendingRefundHtml}

    <h2>5. Relevé de compte final</h2>
    <p>Après règlement intégral de tous les montants encore dus et clôture des opérations, JUN remettra au client un relevé de compte final indiquant un solde de <strong>0.00</strong>. Ce relevé constituera la confirmation comptable de la clôture financière du dossier.</p>

    <h2>6. Fin des services et transactions futures</h2>
    <p>À la clôture définitive, aucun nouveau service, dossier, paiement commercial, réservation, facture ou autre transaction ne pourra être ouvert avec ce client, sauf décision exceptionnelle formelle de la direction conformément aux contrôles internes de JUN.</p>

    <h2>7. Documents confidentiels et conservation des archives</h2>
    <p>Après la clôture définitive de la collaboration, les fichiers confidentiels d’identité et de voyage déposés dans JUN Drive, notamment les pièces classées IDENTITY, PASSPORT et VISA, seront automatiquement détruits du stockage opérationnel. JUN conservera toutefois les écritures d’audit attestant leur destruction. Les preuves de paiement et de remboursement, reçus, contrats, avis officiels et autres archives financières ou juridiques nécessaires à la traçabilité restent conservés conformément aux obligations de tenue de dossiers applicables.</p>

    <h2>8. Accès aux preuves et authenticité</h2>
    <p>Chaque paiement et remboursement ci-dessus comporte, lorsqu’une pièce est disponible dans JUN Drive, un lien d’accès à la preuve correspondante. Ces liens sont destinés au client ou à toute personne autorisée à consulter le dossier. L’authenticité du présent avis repose sur son QR code de vérification, son identifiant documentaire unique et le sceau officiel JUN. Aucune signature manuscrite n’est requise pour ce type d’avis électronique.</p>

    <h2>9. Clôture</h2>
    <p>Le présent avis, accompagné du Statement final lorsqu’il sera disponible, constitue la communication officielle de clôture de la relation commerciale. JUN CREATIF AND TRAVEL LLC remercie le client de prendre acte de cette décision et des opérations financières de clôture décrites ci-dessus.</p>
  `);

  const documentId = await nextNumber("JUN-LTR");
  const doc = await prisma.document.create({
    data: {
      documentId,
      type: "LETTER",
      title: "AVIS FINAL — FIN DE RELATION COMMERCIALE",
      clientId,
      authorId: user.id,
      versions: {
        create: {
          version: 1,
          content: html,
          authorId: user.id,
          changeNote: "Official final account termination notice generated from verified financial records",
          hash: sha256(html),
        },
      },
    },
  });

  await audit({ userId: user.id, action: "CLIENT_FINAL_NOTICE_CREATED", resourceType: "Document", resourceId: doc.id, after: { documentId, clientId, payments: client.payments.length, refunds: client.refunds.length, evidenceFiles: uniqueFiles.length } });
  await logActivity({ userId: user.id, type: "DOCUMENT_CREATED", message: `Official final relationship notice ${documentId} created from verified account records`, clientId });
  refresh(clientId);
  redirect(`/app/documents/${doc.id}?toast=${encodeURIComponent("Official final notice created — review and FINALIZE it before attaching to the termination file")}`);
}

export async function attachFinalTerminationNotice(clientId: string, formData: FormData) {
  const user = await assertPermission("CLIENT_ARCHIVE");
  const workflow = await getClientTermination(clientId);
  if (!workflow || ["CANCELLED", "TERMINATED"].includes(workflow.status)) redirect(relationshipPath(clientId, "No active termination review.", true));
  const documentId = String(formData.get("documentId") || "").trim();
  const doc = await prisma.document.findFirst({
    where: { id: documentId, clientId, status: { in: ["FINAL", "SIGNED"] } },
    select: { id: true, documentId: true, title: true, status: true },
  });
  if (!doc) redirect(relationshipPath(clientId, "Select a FINAL official termination notice belonging to this client.", true));
  await saveClientTermination({ ...workflow, signedDocumentId: doc.id, status: "READY_TO_SIGN" });
  await audit({ userId: user.id, action: "CLIENT_TERMINATION_FINAL_NOTICE_ATTACHED", resourceType: "Client", resourceId: clientId, after: { documentId: doc.documentId, title: doc.title, status: doc.status } });
  refresh(clientId);
  redirect(relationshipPath(clientId, "Final QR/seal-authenticated termination notice attached."));
}

export async function markFinalTerminationPackageDelivered(clientId: string, formData: FormData) {
  const user = await assertPermission("CLIENT_ARCHIVE");
  const workflow = await getClientTermination(clientId);
  if (!workflow?.signedDocumentId) redirect(relationshipPath(clientId, "Attach the FINAL termination notice first.", true));
  const note = String(formData.get("deliveryNote") || "").trim().slice(0, 1500);
  if (note.length < 5) redirect(relationshipPath(clientId, "Record how the final notice and statement were delivered.", true));
  const now = new Date().toISOString();
  await saveClientTermination({ ...workflow, packageDeliveredAt: now, deliveryNote: note, status: "READY_TO_TERMINATE" });
  await audit({ userId: user.id, action: "CLIENT_TERMINATION_PACKAGE_DELIVERED", resourceType: "Client", resourceId: clientId, after: { deliveredAt: now, deliveryNote: note } });
  await logActivity({ userId: user.id, type: "DOCUMENT_SENT", message: "Final QR/seal-authenticated termination notice and final statement package delivered to client", clientId });
  refresh(clientId);
  redirect(relationshipPath(clientId, "Final notice + statement delivery recorded."));
}

async function purgeConfidentialClientFiles(clientId: string, userId: string) {
  const files = await prisma.file.findMany({
    where: { clientId, category: { in: [...CONFIDENTIAL_CATEGORIES] }, archivedAt: null },
    select: { id: true, name: true, storageKey: true, category: true, sizeBytes: true },
  });
  const failures: string[] = [];
  let deleted = 0;
  for (const file of files) {
    try {
      await storage().remove(file.storageKey);
      await prisma.file.delete({ where: { id: file.id } });
      deleted++;
      await audit({ userId, action: "CLIENT_CONFIDENTIAL_FILE_DESTROYED", resourceType: "File", resourceId: file.id, before: { name: file.name, category: file.category, sizeBytes: file.sizeBytes }, after: { clientId, destroyed: true, reason: "Formal end of commercial relationship" } });
    } catch {
      failures.push(file.name);
      await audit({ userId, action: "CLIENT_CONFIDENTIAL_FILE_DELETION_FAILED", resourceType: "File", resourceId: file.id, after: { clientId, name: file.name, category: file.category } });
    }
  }
  return { deleted, failures };
}

export async function finalizeClientTerminationFinalNotice(clientId: string, formData: FormData) {
  const user = await assertPermission("CLIENT_ARCHIVE");
  const workflow = await getClientTermination(clientId);
  if (!workflow || workflow.status === "CANCELLED") redirect(relationshipPath(clientId, "No active termination review.", true));
  const confirmation = String(formData.get("confirmation") || "").trim();
  if (confirmation !== "FINALIZE TERMINATION") redirect(relationshipPath(clientId, "Type FINALIZE TERMINATION to confirm.", true));
  const readiness = await getClientTerminationReadiness(clientId);
  if (!readiness) redirect("/app/clients");
  if (!readiness.transactionsSettled) redirect(relationshipPath(clientId, "Final blocking is not allowed until all cases and financial transactions are fully settled.", true));
  if (!workflow.signedDocumentId || !workflow.packageDeliveredAt) redirect(relationshipPath(clientId, "FINAL termination notice and delivery of the final package are mandatory.", true));
  const doc = await prisma.document.findFirst({ where: { id: workflow.signedDocumentId, clientId, status: { in: ["FINAL", "SIGNED"] } }, select: { id: true, documentId: true } });
  if (!doc) redirect(relationshipPath(clientId, "The attached termination notice is no longer FINAL.", true));

  const purge = await purgeConfidentialClientFiles(clientId, user.id);
  if (purge.failures.length) redirect(relationshipPath(clientId, `Termination paused: ${purge.failures.length} confidential file(s) could not be destroyed. Retry after resolving storage access.`, true));

  const now = new Date().toISOString();
  const previous = await getClientBlock(clientId);
  await saveClientBlock({ clientId, blocked: true, reason: workflow.reason, blockedAt: now, blockedById: user.id, unblockedAt: null, unblockedById: null });
  await saveClientTermination({ ...workflow, status: "TERMINATED", completedAt: now, completedById: user.id });
  await audit({ userId: user.id, action: "CLIENT_RELATIONSHIP_FORMALLY_TERMINATED", resourceType: "Client", resourceId: clientId, before: previous || undefined, after: { blocked: true, reason: workflow.reason, completedAt: now, finalNoticeDocumentId: doc.documentId, confidentialFilesDestroyed: purge.deleted } });
  await logActivity({ userId: user.id, type: "CLIENT_BLOCKED", message: `Commercial relationship formally terminated; ${purge.deleted} confidential identity/travel file(s) destroyed; financial/legal archives preserved`, clientId });
  refresh(clientId);
  redirect(`/app/clients/${clientId}/dashboard?toast=${encodeURIComponent("Relationship formally terminated — future transactions blocked and confidential identity/travel files destroyed")}`);
}
