import "server-only";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import { gmailSend } from "@/lib/google/gmail";
import { sendWhatsAppLink } from "@/lib/whatsapp-outreach";
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
        await sendWhatsAppLink({
          to,
          firstName: c.client.firstName,
          url,
          subject: fr ? "votre demande de remboursement" : "your refund request",
          text,
          language: c.language,
          kind: "REFUND_CLAIM",
          recordId: c.id,
          userId: c.requestedById,
        });
        sent.push("WHATSAPP");
      } catch (e) {
        errors.push(`WhatsApp : ${(e instanceof Error ? e.message : "échec").slice(0, 220)}`);
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
      client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
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
    fullName: `${c.client.firstName} ${c.client.lastName}`.trim(),
    infoRequest: c.status === "NEEDS_INFO" ? (c.infoRequest as InfoRequest | null) : null,
    tracking: {
      status: c.status as ClaimStatus,
      submittedAt: c.submittedAt,
      decidedAt: c.decidedAt,
      decisionNote: c.status === "REJECTED" ? c.decisionNote : null,
      partial: (() => {
        const d = c.decision as ClaimDecision | null;
        if (!d || !c.amount || d.approvedAmount >= Number(c.amount) - 0.005) return null;
        return {
          requested: Number(c.amount),
          approved: d.approvedAmount,
          currency: c.currency ?? "USD",
          reason: d.partialReason,
          services: d.renderedServices ?? [],
          proofFileIds: d.proofFileIds ?? [],
        };
      })(),
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

export type ClaimFile = {
  fileId: string;
  role: "ID" | "SELFIE" | "PAYMENT_PROOF" | "EVIDENCE";
  name: string;
};
export type ClaimDetails = {
  identity: { fullName: string; dateOfBirth: string; idType: string; idNumber: string };
  payment: {
    paidOn: string;
    paidAmount: number;
    currency: string;
    method: string;
    reference: string;
    paidTo: string;
  };
  service: { type: string; description: string; caseReference: string; date: string };
  fullRefund: boolean;
  declaration: { signature: string; signedAt: string; ip: string | null; userAgent: string | null };
  files: ClaimFile[];
};
export type ClaimSubmission = {
  details: ClaimDetails;
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
      dueAt: addBusinessDays(new Date(), 5),
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
      submission: s.details as unknown as Prisma.InputJsonValue,
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
  const d = c.decision as ClaimDecision | null;
  const isPartial = Boolean(d && c.amount && d.approvedAmount < Number(c.amount) - 0.005);
  const svcFr = d?.renderedServices?.length
    ? `\nServices déjà rendus :\n${d.renderedServices.map((s) => `  • ${s.description} — ${c.currency} ${s.amount.toFixed(2)}`).join("\n")}`
    : "";
  const svcEn = d?.renderedServices?.length
    ? `\nServices already delivered:\n${d.renderedServices.map((s) => `  • ${s.description} — ${c.currency} ${s.amount.toFixed(2)}`).join("\n")}`
    : "";
  const partialFr =
    isPartial && d
      ? `\n\nMontant demandé : ${c.currency} ${Number(c.amount).toFixed(2)} — montant accepté : ${c.currency} ${d.approvedAmount.toFixed(2)}.${d.partialReason ? `\nMotif de la retenue : ${d.partialReason}` : ""}${svcFr}\nLes justificatifs sont consultables sur votre page de suivi.`
      : "";
  const partialEn =
    isPartial && d
      ? `\n\nRequested: ${c.currency} ${Number(c.amount).toFixed(2)} — approved: ${c.currency} ${d.approvedAmount.toFixed(2)}.${d.partialReason ? `\nReason for the deduction: ${d.partialReason}` : ""}${svcEn}\nSupporting documents are available on your tracking page.`
      : "";
  const to = c.contactEmail || c.client.email;
  if (!to) return;
  const fr = c.language === "fr";
  const text =
    decision === "REJECTED"
      ? fr
        ? `Bonjour ${c.client.firstName},\n\nAprès examen, nous ne pouvons pas donner suite à votre demande de remboursement.${note ? `\n\nMotif : ${note}` : ""}\n\nVous pouvez nous répondre pour toute question.\n\nJUN CREATIF AND TRAVEL LLC`
        : `Hello ${c.client.firstName},\n\nAfter review, we are unable to approve your refund request.${note ? `\n\nReason: ${note}` : ""}\n\nReply to this e-mail if you have any question.\n\nJUN CREATIF AND TRAVEL LLC`
      : fr
        ? `Bonjour ${c.client.firstName},\n\nVotre demande de remboursement a été acceptée. Dossier ${c.refund?.refundNumber ?? ""} · ${c.refund?.currency ?? ""} ${c.refund ? Number(c.refund.amount).toFixed(2) : ""}.${partialFr}${note ? `\n\n${note}` : ""}\n\nNous vous tiendrons informé du versement.\n\nJUN CREATIF AND TRAVEL LLC`
        : `Hello ${c.client.firstName},\n\nYour refund request has been approved. File ${c.refund?.refundNumber ?? ""} · ${c.refund?.currency ?? ""} ${c.refund ? Number(c.refund.amount).toFixed(2) : ""}.${partialEn}${note ? `\n\n${note}` : ""}\n\nWe will keep you posted on the payout.\n\nJUN CREATIF AND TRAVEL LLC`;
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

export function addBusinessDays(from: Date, days: number) {
  const d = new Date(from);
  let n = 0;
  while (n < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return d;
}

export type InfoRequest = {
  message: string;
  steps: string[];
  askedAt: string;
  askedById: string;
  replies: Array<{ at: string; text: string; fileIds: string[] }>;
};
export type ClaimDecision = {
  approvedAmount: number;
  requestedAmount: number;
  partialReason: string | null;
  renderedServices: Array<{ description: string; amount: number }>;
  proofFileIds: string[];
  note: string | null;
  decidedAt: string;
  decidedById: string;
};

/** Asks the client for more information; the form link reopens on a complement step. */
export async function requestClaimInformation(
  id: string,
  askedById: string,
  message: string,
  steps: string[],
) {
  const c = await prisma.refundClaim.findUnique({
    where: { id },
    include: { client: { select: { firstName: true, email: true } } },
  });
  if (!c) throw new Error("Claim not found");
  const info: InfoRequest = { message, steps, askedAt: new Date().toISOString(), askedById, replies: [] };
  await prisma.refundClaim.update({
    where: { id },
    data: { status: "NEEDS_INFO", infoRequest: info as unknown as Prisma.InputJsonValue },
  });
  const to = c.contactEmail || c.client.email;
  if (to) {
    const fr = c.language === "fr";
    try {
      const account = await resolveOtpSenderMailbox();
      await gmailSend(account.id, {
        fromEmail: AUTOMATED_NO_REPLY_EMAIL,
        automated: true,
        to,
        subject: fr
          ? "Votre demande de remboursement — complément demandé"
          : "Your refund request — more information needed",
        text: fr
          ? `Bonjour ${c.client.firstName},\n\nPour instruire votre demande de remboursement, nous avons besoin d’un complément :\n\n${message}\n\nRépondez et joignez les éléments via votre lien :\n${claimUrl(c.token)}\n\nJUN CREATIF AND TRAVEL LLC`
          : `Hello ${c.client.firstName},\n\nTo process your refund request we need more information:\n\n${message}\n\nReply and attach the items through your link:\n${claimUrl(c.token)}\n\nJUN CREATIF AND TRAVEL LLC`,
      });
    } catch {}
  }
}

/** Client reply to an information request. */
export async function answerClaimInformation(id: string, text: string, fileIds: string[]) {
  const c = await prisma.refundClaim.findUnique({
    where: { id },
    select: {
      infoRequest: true,
      fileIds: true,
      assignedToId: true,
      requestedById: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  if (!c) return;
  const info = (c.infoRequest ?? {
    message: "",
    steps: [],
    askedAt: "",
    askedById: "",
    replies: [],
  }) as InfoRequest;
  info.replies = [...(info.replies ?? []), { at: new Date().toISOString(), text, fileIds }];
  await prisma.refundClaim.update({
    where: { id },
    data: {
      status: "UNDER_REVIEW",
      infoRequest: info as unknown as Prisma.InputJsonValue,
      fileIds: [...c.fileIds, ...fileIds],
    },
  });
  const notify = c.assignedToId ?? c.requestedById;
  await prisma.notification
    .create({
      data: {
        userId: notify,
        type: "REFUND_CLAIM_INFO_REPLIED",
        title: `Complément reçu — ${c.client.firstName} ${c.client.lastName}`,
        body: text.slice(0, 200),
      },
    })
    .catch(() => null);
}

/** Cron: SLA alerts (due within 24 h or overdue) to the assignee, else finance staff. */
export async function processClaimSlaAlerts() {
  const soon = new Date(Date.now() + 24 * 3600_000);
  const due = await prisma.refundClaim.findMany({
    where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] }, dueAt: { lte: soon }, slaAlertedAt: null },
    take: 30,
    select: {
      id: true,
      dueAt: true,
      assignedToId: true,
      amount: true,
      currency: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  let alerted = 0;
  for (const c of due) {
    const overdue = c.dueAt && c.dueAt.getTime() < Date.now();
    const targets = c.assignedToId
      ? [c.assignedToId]
      : (
          await prisma.user.findMany({
            where: { role: { in: ["SUPER_ADMIN", "FINANCE", "DIRECTOR"] }, status: "ACTIVE" },
            select: { id: true },
          })
        ).map((u) => u.id);
    if (targets.length)
      await prisma.notification.createMany({
        data: targets.map((userId) => ({
          userId,
          type: overdue ? "REFUND_CLAIM_SLA_OVERDUE" : "REFUND_CLAIM_SLA_DUE",
          title: overdue
            ? "Demande de remboursement en retard"
            : "Demande de remboursement à traiter sous 24 h",
          body: `${c.client.firstName} ${c.client.lastName} · ${c.currency ?? ""} ${c.amount ? Number(c.amount).toFixed(2) : ""} · échéance ${c.dueAt?.toLocaleDateString("fr-FR") ?? ""}`,
        })),
      });
    await prisma.refundClaim.update({ where: { id: c.id }, data: { slaAlertedAt: new Date() } });
    alerted++;
  }
  return { due: due.length, alerted };
}

/** Compares the declared identity with what AI extracted from the uploaded ID document. */
export async function identityCheck(claimId: string) {
  const c = await prisma.refundClaim.findUnique({
    where: { id: claimId },
    select: { submission: true, client: { select: { firstName: true, lastName: true } } },
  });
  if (!c) return null;
  const sub = (c.submission ?? {}) as Partial<ClaimDetails>;
  const idFile = (sub.files ?? []).find((f) => f.role === "ID");
  if (!idFile || !sub.identity) return null;
  const x = await prisma.fileExtraction.findUnique({ where: { fileId: idFile.fileId } });
  if (!x)
    return {
      pending: true as const,
      checks: [] as Array<{ label: string; declared: string; extracted: string; ok: boolean | null }>,
    };
  const norm = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const nameOk = x.holderName
    ? norm(sub.identity.fullName).includes(norm(x.holderName).slice(0, 12)) ||
      norm(x.holderName).includes(norm(sub.identity.fullName).slice(0, 12))
    : null;
  const numOk = x.documentNumber ? norm(x.documentNumber) === norm(sub.identity.idNumber) : null;
  const dobOk = x.dateOfBirth ? x.dateOfBirth.toISOString().slice(0, 10) === sub.identity.dateOfBirth : null;
  const expired = x.expiresAt ? x.expiresAt.getTime() < Date.now() : null;
  return {
    pending: false as const,
    docType: x.docType,
    expired,
    checks: [
      { label: "Nom", declared: sub.identity.fullName, extracted: x.holderName ?? "—", ok: nameOk },
      { label: "Numéro", declared: sub.identity.idNumber, extracted: x.documentNumber ?? "—", ok: numOk },
      {
        label: "Date de naissance",
        declared: sub.identity.dateOfBirth,
        extracted: x.dateOfBirth ? x.dateOfBirth.toISOString().slice(0, 10) : "—",
        ok: dobOk,
      },
      {
        label: "Fiche client",
        declared: `${c.client.firstName} ${c.client.lastName}`,
        extracted: x.holderName ?? "—",
        ok: x.holderName ? norm(x.holderName).includes(norm(c.client.lastName)) : null,
      },
    ],
  };
}

/** Stats for the refunds page. */
export async function refundClaimStats() {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await prisma.refundClaim.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, submittedAt: true, decidedAt: true, dueAt: true, amount: true, decision: true },
  });
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  const decided = rows.filter(
    (r) => r.submittedAt && r.decidedAt && ["CONVERTED", "REJECTED"].includes(r.status),
  );
  const avgDays = decided.length
    ? decided.reduce((s, r) => s + (r.decidedAt!.getTime() - r.submittedAt!.getTime()) / 86_400_000, 0) /
      decided.length
    : null;
  const accepted = rows.filter((r) => r.status === "CONVERTED").length;
  const partial = rows.filter((r) => {
    const d = r.decision as ClaimDecision | null;
    return d && r.amount && d.approvedAmount < Number(r.amount) - 0.005;
  }).length;
  const overdue = rows.filter(
    (r) =>
      ["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO"].includes(r.status) &&
      r.dueAt &&
      r.dueAt.getTime() < Date.now(),
  ).length;
  return {
    total: rows.length,
    by,
    avgDays,
    acceptRate: decided.length ? accepted / decided.length : null,
    partial,
    overdue,
  };
}
