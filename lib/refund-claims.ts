import "server-only";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import { gmailSend } from "@/lib/google/gmail";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { appBaseUrl } from "@/lib/document-requests";

export type ClaimStatus =
  "SENT" | "SUBMITTED" | "UNDER_REVIEW" | "CONVERTED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export const REASON_CODES = [
  { code: "SERVICE_CANCELLED", fr: "Service annulé", en: "Service cancelled" },
  { code: "TRIP_CANCELLED", fr: "Voyage annulé / modifié", en: "Trip cancelled / changed" },
  { code: "VISA_REFUSED", fr: "Visa refusé", en: "Visa refused" },
  { code: "DUPLICATE_PAYMENT", fr: "Paiement en double", en: "Duplicate payment" },
  { code: "OVERCHARGED", fr: "Montant facturé incorrect", en: "Incorrect amount charged" },
  { code: "NOT_DELIVERED", fr: "Service non rendu", en: "Service not delivered" },
  { code: "OTHER", fr: "Autre motif", en: "Other reason" },
] as const;
export type ReasonCode = (typeof REASON_CODES)[number]["code"];
export function reasonLabel(code: string | null | undefined, lang = "fr") {
  const r = REASON_CODES.find((x) => x.code === code);
  return r ? (lang === "fr" ? r.fr : r.en) : (code ?? "");
}

export const PAYOUT_METHODS = [
  { code: "ORIGINAL", fr: "Sur le moyen de paiement d’origine", en: "Back to the original payment method" },
  { code: "BANK_TRANSFER", fr: "Virement bancaire", en: "Bank transfer" },
  { code: "CASH", fr: "Espèces / en agence", en: "Cash / in person" },
  { code: "OTHER", fr: "Autre (préciser)", en: "Other (specify)" },
] as const;
export function payoutLabel(code: string | null | undefined, lang = "fr") {
  const r = PAYOUT_METHODS.find((x) => x.code === code);
  return r ? (lang === "fr" ? r.fr : r.en) : (code ?? "");
}

export function claimUrl(token: string) {
  return `${appBaseUrl()}/refund/${token}`;
}

/** Creates the secure link for a client (optionally for one payment / case). */
export async function createRefundClaimLink(input: {
  clientId: string;
  caseId?: string | null;
  paymentId?: string | null;
  requestedById: string;
  message?: string | null;
  language?: string;
  validDays?: number;
}) {
  return prisma.refundClaim.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      clientId: input.clientId,
      caseId: input.caseId ?? null,
      paymentId: input.paymentId ?? null,
      requestedById: input.requestedById,
      message: input.message?.trim() || null,
      language: input.language ?? "fr",
      expiresAt: new Date(Date.now() + Math.min(90, Math.max(3, input.validDays ?? 30)) * 86_400_000),
    },
  });
}

/** Sends the link by e-mail and/or WhatsApp. */
export async function deliverRefundClaimLink(claimId: string, channels: Array<"EMAIL" | "WHATSAPP">) {
  const c = await prisma.refundClaim.findUnique({
    where: { id: claimId },
    include: {
      client: { select: { firstName: true, lastName: true, email: true, whatsapp: true, phone: true } },
      payment: { select: { reference: true, amount: true, currency: true } },
    },
  });
  if (!c) throw new Error("Claim link not found");
  const fr = c.language === "fr";
  const url = claimUrl(c.token);
  const until = c.expiresAt.toLocaleDateString(fr ? "fr-FR" : "en-US");
  const pay = c.payment
    ? ` (${c.payment.reference} · ${c.payment.currency} ${Number(c.payment.amount).toFixed(2)})`
    : "";
  const text = fr
    ? [
        `Bonjour ${c.client.firstName},`,
        "",
        `Pour formuler votre demande de remboursement${pay}, merci de remplir ce formulaire sécurisé, sans créer de compte :`,
        url,
        "",
        c.message ? `${c.message}\n` : "",
        "Vous pourrez indiquer le montant, le motif, le mode de remboursement souhaité et joindre vos justificatifs.",
        `Le lien est valable jusqu’au ${until}.`,
        "",
        "JUN CREATIF AND TRAVEL LLC",
      ].join("\n")
    : [
        `Hello ${c.client.firstName},`,
        "",
        `To file your refund request${pay}, please complete this secure form (no account needed):`,
        url,
        "",
        c.message ? `${c.message}\n` : "",
        "You can state the amount, the reason, your preferred refund method and attach supporting documents.",
        `The link is valid until ${until}.`,
        "",
        "JUN CREATIF AND TRAVEL LLC",
      ].join("\n");
  const sent: string[] = [];
  const errors: string[] = [];
  if (channels.includes("EMAIL")) {
    if (!c.client.email) errors.push("Le client n’a pas d’adresse e-mail");
    else
      try {
        const account = await resolveOtpSenderMailbox();
        await gmailSend(account.id, {
          fromEmail: AUTOMATED_NO_REPLY_EMAIL,
          automated: true,
          to: `${c.client.firstName} ${c.client.lastName} <${c.client.email}>`,
          subject: fr ? "Votre demande de remboursement — formulaire" : "Your refund request — form",
          text,
        });
        sent.push("EMAIL");
      } catch (e) {
        errors.push(`E-mail : ${e instanceof Error ? e.message : "échec"}`);
      }
  }
  if (channels.includes("WHATSAPP")) {
    const to = c.client.whatsapp || c.client.phone;
    if (!to) errors.push("Le client n’a pas de numéro WhatsApp");
    else
      try {
        await sendWhatsAppText(to, text);
        sent.push("WHATSAPP");
      } catch (e) {
        const raw = e instanceof Error ? e.message : "échec";
        errors.push(
          raw.includes("131047") || raw.includes("re-engagement")
            ? "WhatsApp : fenêtre de 24 h fermée — copiez le lien et envoyez-le via un modèle approuvé"
            : `WhatsApp : ${raw.slice(0, 160)}`,
        );
      }
  }
  if (sent.length)
    await prisma.refundClaim.update({
      where: { id: c.id },
      data: { sentVia: Array.from(new Set([...c.sentVia, ...sent])) },
    });
  return { sent, errors, url };
}

/** What the public form may show: first name, refundable payments, prior submission. */
export async function getPublicClaim(token: string) {
  const c = await prisma.refundClaim.findUnique({
    where: { token },
    include: {
      client: { select: { id: true, firstName: true, email: true, phone: true } },
      payment: { select: { id: true, reference: true, amount: true, currency: true, createdAt: true } },
    },
  });
  if (!c) return null;
  const payments = c.payment
    ? [c.payment]
    : await prisma.payment.findMany({
        where: { clientId: c.clientId, status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, reference: true, amount: true, currency: true, createdAt: true },
      });
  const refund = c.refundId
    ? await prisma.refund.findUnique({
        where: { id: c.refundId },
        select: {
          refundNumber: true,
          status: true,
          amount: true,
          currency: true,
          installments: {
            select: { amount: true, dueDate: true, paidAt: true, status: true },
            orderBy: { number: "asc" },
          },
        },
      })
    : null;
  return {
    id: c.id,
    firstName: c.client.firstName,
    tracking: {
      status: c.status as ClaimStatus,
      submittedAt: c.submittedAt,
      decidedAt: c.decidedAt,
      decisionNote: c.status === "REJECTED" ? c.decisionNote : null,
      refund: refund
        ? {
            number: refund.refundNumber,
            status: refund.status,
            amount: Number(refund.amount),
            currency: refund.currency,
            paid: refund.installments.filter((i) => i.paidAt).reduce((s, i) => s + Number(i.amount), 0),
            nextDue: refund.installments.find((i) => !i.paidAt)?.dueDate ?? null,
            lastPaidAt:
              refund.installments
                .filter((i) => i.paidAt)
                .map((i) => i.paidAt!)
                .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
          }
        : null,
    },
    email: c.client.email,
    phone: c.client.phone,
    language: c.language,
    message: c.message,
    status: c.status as ClaimStatus,
    expired: c.expiresAt.getTime() < Date.now() || c.status === "EXPIRED",
    closed: ["CANCELLED", "EXPIRED"].includes(c.status),
    submitted: Boolean(c.submittedAt),
    lockedPayment: Boolean(c.paymentId),
    payments: payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      amount: Number(p.amount),
      currency: p.currency,
      date: p.createdAt,
    })),
    expiresAt: c.expiresAt,
  };
}

export type ClaimSubmission = {
  paymentId: string | null;
  amount: number;
  currency: string;
  reasonCode: string;
  reason: string;
  payoutMethod: string;
  payoutDetails: Record<string, string>;
  contactEmail: string | null;
  contactPhone: string | null;
  fileIds: string[];
  clientIp: string | null;
};

export async function submitClaim(id: string, s: ClaimSubmission) {
  const claim = await prisma.refundClaim.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      paymentId: s.paymentId,
      amount: new Prisma.Decimal(s.amount.toFixed(2)),
      currency: s.currency,
      reasonCode: s.reasonCode,
      reason: s.reason,
      payoutMethod: s.payoutMethod,
      payoutDetails: s.payoutDetails as Prisma.InputJsonValue,
      contactEmail: s.contactEmail,
      contactPhone: s.contactPhone,
      fileIds: s.fileIds,
      clientIp: s.clientIp,
    },
    include: {
      client: { select: { firstName: true, lastName: true, email: true } },
      payment: { select: { reference: true } },
    },
  });
  // Notify finance staff
  const staff = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "DIRECTOR", "FINANCE", "ACCOUNTANT"] }, status: "ACTIVE" },
    select: { id: true },
  });
  const title = `Demande de remboursement — ${claim.client.firstName} ${claim.client.lastName}`;
  const body = `${claim.currency} ${Number(claim.amount).toFixed(2)} · ${reasonLabel(claim.reasonCode)}${claim.payment ? ` · ${claim.payment.reference}` : ""}`;
  if (staff.length)
    await prisma.notification.createMany({
      data: staff.map((u) => ({ userId: u.id, type: "REFUND_CLAIM_SUBMITTED", title, body })),
    });
  // Acknowledgement to the client
  const to = claim.contactEmail || claim.client.email;
  if (to) {
    try {
      const account = await resolveOtpSenderMailbox();
      const fr = claim.language === "fr";
      await gmailSend(account.id, {
        fromEmail: AUTOMATED_NO_REPLY_EMAIL,
        automated: true,
        to,
        subject: fr ? "Demande de remboursement reçue" : "Refund request received",
        text: fr
          ? `Bonjour ${claim.client.firstName},\n\nNous avons bien reçu votre demande de remboursement de ${claim.currency} ${Number(claim.amount).toFixed(2)} (motif : ${reasonLabel(claim.reasonCode, "fr")}).\nRéférence : ${claim.id.slice(-8).toUpperCase()}\n\nNotre équipe finance l’examine et vous répondra sous 5 jours ouvrés.\n\nJUN CREATIF AND TRAVEL LLC`
          : `Hello ${claim.client.firstName},\n\nWe received your refund request of ${claim.currency} ${Number(claim.amount).toFixed(2)} (reason: ${reasonLabel(claim.reasonCode, "en")}).\nReference: ${claim.id.slice(-8).toUpperCase()}\n\nOur finance team is reviewing it and will reply within 5 business days.\n\nJUN CREATIF AND TRAVEL LLC`,
      });
    } catch {}
  }
  return claim;
}

/** Sends the decision (rejection or conversion) to the client. */
export async function notifyClaimDecision(
  claimId: string,
  decision: "REJECTED" | "CONVERTED",
  note: string | null,
) {
  const c = await prisma.refundClaim.findUnique({
    where: { id: claimId },
    include: {
      client: { select: { firstName: true, email: true } },
      refund: { select: { refundNumber: true, amount: true, currency: true } },
    },
  });
  if (!c) return;
  const to = c.contactEmail || c.client.email;
  if (!to) return;
  const fr = c.language === "fr";
  const text =
    decision === "REJECTED"
      ? fr
        ? `Bonjour ${c.client.firstName},\n\nAprès examen, nous ne pouvons pas donner suite à votre demande de remboursement.${note ? `\n\nMotif : ${note}` : ""}\n\nVous pouvez nous répondre pour toute question.\n\nJUN CREATIF AND TRAVEL LLC`
        : `Hello ${c.client.firstName},\n\nAfter review, we are unable to approve your refund request.${note ? `\n\nReason: ${note}` : ""}\n\nReply to this e-mail if you have any question.\n\nJUN CREATIF AND TRAVEL LLC`
      : fr
        ? `Bonjour ${c.client.firstName},\n\nVotre demande de remboursement a été acceptée. Dossier ${c.refund?.refundNumber ?? ""} · ${c.refund?.currency ?? ""} ${c.refund ? Number(c.refund.amount).toFixed(2) : ""}.${note ? `\n\n${note}` : ""}\n\nNous vous tiendrons informé du versement.\n\nJUN CREATIF AND TRAVEL LLC`
        : `Hello ${c.client.firstName},\n\nYour refund request has been approved. File ${c.refund?.refundNumber ?? ""} · ${c.refund?.currency ?? ""} ${c.refund ? Number(c.refund.amount).toFixed(2) : ""}.${note ? `\n\n${note}` : ""}\n\nWe will keep you posted on the payout.\n\nJUN CREATIF AND TRAVEL LLC`;
  try {
    const account = await resolveOtpSenderMailbox();
    await gmailSend(account.id, {
      fromEmail: AUTOMATED_NO_REPLY_EMAIL,
      automated: true,
      to,
      subject: fr ? "Votre demande de remboursement" : "Your refund request",
      text,
    });
  } catch {}
}

/** Cron: expire stale links and remind clients once when the form is still unanswered after 3 days. */
export async function processRefundClaimReminders() {
  const now = new Date();
  await prisma.refundClaim.updateMany({
    where: { status: "SENT", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  const due = await prisma.refundClaim.findMany({
    where: {
      status: "SENT",
      createdAt: { lt: new Date(now.getTime() - 3 * 86_400_000) },
      sentVia: { isEmpty: false },
      NOT: { message: { contains: "[reminded]" } },
    },
    take: 20,
    select: { id: true, sentVia: true, message: true },
  });
  let reminded = 0;
  for (const c of due) {
    const res = await deliverRefundClaimLink(c.id, c.sentVia as Array<"EMAIL" | "WHATSAPP">).catch(
      () => null,
    );
    if (res?.sent.length) {
      reminded++;
      await prisma.refundClaim.update({
        where: { id: c.id },
        data: { message: `${c.message ?? ""} [reminded]`.trim() },
      });
    }
  }
  return { due: due.length, reminded };
}

/**
 * Self-service entry from the website: if the e-mail belongs to a client, a
 * personal form link is created and e-mailed. The caller never learns whether
 * the address exists.
 */
export async function requestRefundFormByEmail(email: string, reference: string | null, language: string) {
  const client = await prisma.client.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, archivedAt: null },
    select: { id: true },
  });
  if (!client) return { matched: false };
  const requester = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "FINANCE", "DIRECTOR"] }, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!requester) return { matched: false };
  const payment = reference
    ? await prisma.payment.findFirst({
        where: {
          clientId: client.id,
          reference: { equals: reference, mode: "insensitive" },
          status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] },
        },
        select: { id: true },
      })
    : null;
  const claim = await createRefundClaimLink({
    clientId: client.id,
    paymentId: payment?.id ?? null,
    requestedById: requester.id,
    language,
    message:
      language === "fr" ? "Demande initiée depuis le site web." : "Request initiated from the website.",
  });
  await deliverRefundClaimLink(claim.id, ["EMAIL"]).catch(() => null);
  return { matched: true };
}
