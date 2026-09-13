import "server-only";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import { gmailSend } from "@/lib/google/gmail";
import { sendWhatsAppLink } from "@/lib/whatsapp-outreach";
import { appBaseUrl } from "@/lib/document-requests";
import { nextNumber } from "@/lib/sequence";

export const PAY_METHODS = [
  { code: "BANK_TRANSFER", fr: "Virement bancaire", en: "Bank transfer", hub: "BANK_TRANSFER" },
  { code: "ZELLE", fr: "Zelle", en: "Zelle", hub: "ZELLE" },
  { code: "MONCASH", fr: "MonCash / mobile money", en: "MonCash / mobile money", hub: "MONCASH" },
  { code: "PAYPAL", fr: "PayPal", en: "PayPal", hub: "PAYPAL" },
  { code: "CASH", fr: "Espèces en agence", en: "Cash at the office", hub: "CASH" },
  { code: "WESTERN_UNION", fr: "Western Union / MoneyGram", en: "Western Union / MoneyGram", hub: "OTHER" },
  { code: "ONLINE", fr: "Paiement en ligne (carte)", en: "Online payment (card)", hub: "STRIPE" },
] as const;
export type PayMethodCode = (typeof PAY_METHODS)[number]["code"];
export function payMethodLabel(code: string, lang = "fr") {
  const m = PAY_METHODS.find((x) => x.code === code);
  return m ? (lang === "fr" ? m.fr : m.en) : code;
}

export const INSTRUCTIONS_KEY = "finance.payment_instructions";
export type PaymentInstructions = Partial<Record<PayMethodCode, string>>;
export async function getPaymentInstructions(): Promise<PaymentInstructions> {
  const row = await prisma.appSetting.findUnique({
    where: { key: INSTRUCTIONS_KEY },
    select: { value: true },
  });
  try {
    return row ? (JSON.parse(row.value) as PaymentInstructions) : {};
  } catch {
    return {};
  }
}
export async function savePaymentInstructions(v: PaymentInstructions) {
  const value = JSON.stringify(v);
  await prisma.appSetting.upsert({
    where: { key: INSTRUCTIONS_KEY },
    create: { key: INSTRUCTIONS_KEY, value },
    update: { value },
  });
}

export function paymentRequestUrl(token: string) {
  return `${appBaseUrl()}/p/${token}`;
}

export type PaymentProof = {
  method: string;
  reference: string;
  paidOn: string;
  amount: number;
  payerName: string;
  note: string;
  fileIds: string[];
  submittedAt: string;
  ip: string | null;
};

export async function createPaymentRequest(input: {
  clientId: string;
  caseId?: string | null;
  requestedById: string;
  amount: number;
  currency: string;
  description: string;
  message?: string | null;
  language?: string;
  allowedMethods: string[];
  onlineUrl?: string | null;
  dueAt?: Date | null;
  validDays?: number;
}) {
  const validDays = Math.min(120, Math.max(3, input.validDays ?? 45));
  return prisma.paymentRequest.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      clientId: input.clientId,
      caseId: input.caseId ?? null,
      requestedById: input.requestedById,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      currency: input.currency.toUpperCase(),
      description: input.description.slice(0, 200),
      message: input.message?.trim() || null,
      language: input.language ?? "fr",
      allowedMethods: input.allowedMethods.filter((m) => PAY_METHODS.some((x) => x.code === m)),
      onlineUrl: input.onlineUrl?.trim() || null,
      dueAt: input.dueAt ?? null,
      expiresAt: new Date(Date.now() + validDays * 86_400_000),
      remindAt: input.dueAt
        ? new Date(input.dueAt.getTime() - 2 * 86_400_000)
        : new Date(Date.now() + 5 * 86_400_000),
    },
  });
}

export async function deliverPaymentRequest(
  id: string,
  channels: Array<"EMAIL" | "WHATSAPP">,
  reminder = false,
) {
  const r = await prisma.paymentRequest.findUnique({
    where: { id },
    include: {
      client: { select: { firstName: true, lastName: true, email: true, whatsapp: true, phone: true } },
    },
  });
  if (!r) throw new Error("Payment request not found");
  const fr = r.language === "fr";
  const url = paymentRequestUrl(r.token);
  const amount = `${r.currency} ${Number(r.amount).toFixed(2)}`;
  const due = r.dueAt ? r.dueAt.toLocaleDateString(fr ? "fr-FR" : "en-US") : null;
  const text = fr
    ? [
        `Bonjour ${r.client.firstName},`,
        "",
        reminder
          ? `Rappel : le paiement de ${amount} pour « ${r.description} » est attendu${due ? ` avant le ${due}` : ""}.`
          : `Un paiement de ${amount} est demandé pour « ${r.description} »${due ? `, avant le ${due}` : ""}.`,
        "",
        "Choisissez votre moyen de paiement et envoyez-nous la preuve via ce lien sécurisé :",
        url,
        "",
        r.message ? `${r.message}\n` : "",
        "JUN CREATIF AND TRAVEL LLC",
      ].join("\n")
    : [
        `Hello ${r.client.firstName},`,
        "",
        reminder
          ? `Reminder: the payment of ${amount} for "${r.description}" is due${due ? ` by ${due}` : ""}.`
          : `A payment of ${amount} is requested for "${r.description}"${due ? `, due by ${due}` : ""}.`,
        "",
        "Choose your payment method and send us the proof through this secure link:",
        url,
        "",
        r.message ? `${r.message}\n` : "",
        "JUN CREATIF AND TRAVEL LLC",
      ].join("\n");
  const sent: string[] = [];
  const errors: string[] = [];
  if (channels.includes("EMAIL")) {
    if (!r.client.email) errors.push("Le client n’a pas d’adresse e-mail");
    else
      try {
        const account = await resolveOtpSenderMailbox();
        await gmailSend(account.id, {
          fromEmail: AUTOMATED_NO_REPLY_EMAIL,
          automated: true,
          to: `${r.client.firstName} ${r.client.lastName} <${r.client.email}>`,
          subject: fr
            ? `${reminder ? "Rappel — " : ""}Paiement demandé : ${amount} — ${r.description}`
            : `${reminder ? "Reminder — " : ""}Payment requested: ${amount} — ${r.description}`,
          text,
        });
        sent.push("EMAIL");
      } catch (e) {
        errors.push(`E-mail : ${e instanceof Error ? e.message : "échec"}`);
      }
  }
  if (channels.includes("WHATSAPP")) {
    const to = r.client.whatsapp || r.client.phone;
    if (!to) errors.push("Le client n’a pas de numéro WhatsApp");
    else
      try {
        await sendWhatsAppLink({
          to,
          firstName: r.client.firstName,
          url,
          subject: fr ? `votre paiement de ${amount}` : `your payment of ${amount}`,
          text,
          language: r.language,
          kind: "PAYMENT_REQUEST",
          recordId: r.id,
          userId: r.requestedById,
        });
        sent.push("WHATSAPP");
      } catch (e) {
        errors.push(`WhatsApp : ${(e instanceof Error ? e.message : "échec").slice(0, 220)}`);
      }
  }
  if (sent.length)
    await prisma.paymentRequest.update({
      where: { id },
      data: {
        sentVia: Array.from(new Set([...r.sentVia, ...sent])),
        ...(reminder
          ? { reminderCount: { increment: 1 }, remindAt: new Date(Date.now() + 4 * 86_400_000) }
          : {}),
      },
    });
  return { sent, errors, url };
}

export async function getPublicPaymentRequest(token: string) {
  const r = await prisma.paymentRequest.findUnique({
    where: { token },
    include: {
      client: { select: { firstName: true, lastName: true, email: true, phone: true } },
      payment: { select: { reference: true, status: true } },
    },
  });
  if (!r) return null;
  if (!r.viewedAt && r.status === "SENT")
    await prisma.paymentRequest
      .update({ where: { id: r.id }, data: { viewedAt: new Date(), status: "VIEWED" } })
      .catch(() => null);
  const instructions = await getPaymentInstructions();
  return {
    id: r.id,
    firstName: r.client.firstName,
    fullName: `${r.client.firstName} ${r.client.lastName}`,
    email: r.client.email,
    phone: r.client.phone,
    language: r.language,
    amount: Number(r.amount),
    currency: r.currency,
    description: r.description,
    message: r.message,
    dueAt: r.dueAt,
    status: r.status,
    expired: r.expiresAt.getTime() < Date.now() || r.status === "EXPIRED",
    closed: ["CANCELLED", "EXPIRED"].includes(r.status),
    paid: r.status === "PAID",
    proof: r.proof as PaymentProof | null,
    paymentReference: r.payment?.reference ?? null,
    paymentStatus: r.payment?.status ?? null,
    methods: (r.allowedMethods.length ? r.allowedMethods : PAY_METHODS.map((m) => m.code)).filter(
      (m) => m !== "ONLINE" || r.onlineUrl,
    ),
    onlineUrl: r.onlineUrl,
    instructions,
    expiresAt: r.expiresAt,
  };
}

/** Records the client's proof: creates a PENDING payment with the files attached, notifies finance. */
export async function submitPaymentProof(id: string, proof: PaymentProof) {
  const r = await prisma.paymentRequest.findUnique({
    where: { id },
    include: { client: { select: { firstName: true, lastName: true, email: true } } },
  });
  if (!r) throw new Error("Not found");
  const hubMethod = (PAY_METHODS.find((m) => m.code === proof.method)?.hub ?? "OTHER") as
    "ZELLE" | "STRIPE" | "PAYPAL" | "MERCADO_PAGO" | "BANK_TRANSFER" | "CASH" | "MONCASH" | "OTHER";
  const reference = await nextNumber("PAY");
  const payment = await prisma.payment.create({
    data: {
      reference,
      clientId: r.clientId,
      caseId: r.caseId,
      amount: new Prisma.Decimal(proof.amount.toFixed(2)),
      currency: r.currency,
      method: hubMethod,
      status: "PENDING",
      providerRef: proof.reference || null,
      paidAt: new Date(proof.paidOn),
      notes: `Preuve déposée par le client via la demande de paiement ${r.id.slice(-8).toUpperCase()} — ${r.description}. Moyen déclaré : ${proof.method}. Payeur : ${proof.payerName}.${proof.note ? ` Note : ${proof.note}` : ""}`,
      recordedById: r.requestedById,
    },
  });
  if (proof.fileIds.length)
    await prisma.file.updateMany({ where: { id: { in: proof.fileIds } }, data: { paymentId: payment.id } });
  await prisma.paymentRequest.update({
    where: { id },
    data: {
      status: "PROOF_SUBMITTED",
      proof: proof as unknown as Prisma.InputJsonValue,
      paymentId: payment.id,
      remindAt: null,
    },
  });
  const staff = await prisma.user.findMany({
    where: { role: { in: ["SUPER_ADMIN", "DIRECTOR", "FINANCE", "ACCOUNTANT"] }, status: "ACTIVE" },
    select: { id: true },
  });
  if (staff.length)
    await prisma.notification.createMany({
      data: staff.map((u) => ({
        userId: u.id,
        type: "PAYMENT_PROOF_SUBMITTED",
        title: `Preuve de paiement reçue — ${r.client.firstName} ${r.client.lastName}`,
        body: `${r.currency} ${proof.amount.toFixed(2)} · ${payMethodLabel(proof.method)} · ${reference} — à confirmer`,
      })),
    });
  const to = r.client.email;
  if (to) {
    const fr = r.language === "fr";
    try {
      const account = await resolveOtpSenderMailbox();
      await gmailSend(account.id, {
        fromEmail: AUTOMATED_NO_REPLY_EMAIL,
        automated: true,
        to,
        subject: fr ? "Preuve de paiement reçue" : "Payment proof received",
        text: fr
          ? `Bonjour ${r.client.firstName},\n\nNous avons bien reçu votre preuve de paiement de ${r.currency} ${proof.amount.toFixed(2)} (${payMethodLabel(proof.method)}). Référence : ${reference}.\nNotre équipe la vérifie ; vous recevrez votre reçu dès confirmation.\n\nJUN CREATIF AND TRAVEL LLC`
          : `Hello ${r.client.firstName},\n\nWe received your payment proof of ${r.currency} ${proof.amount.toFixed(2)} (${payMethodLabel(proof.method, "en")}). Reference: ${reference}.\nOur team is verifying it; you will receive your receipt once confirmed.\n\nJUN CREATIF AND TRAVEL LLC`,
      });
    } catch {}
  }
  return { payment, reference };
}

/** Called when the linked payment gets confirmed: closes the request and tells the client. */
export async function markPaymentRequestPaid(paymentId: string) {
  const r = await prisma.paymentRequest.findFirst({
    where: { paymentId, status: { not: "PAID" } },
    include: {
      client: { select: { firstName: true, email: true } },
      payment: { select: { reference: true, amount: true, currency: true } },
    },
  });
  if (!r) return;
  await prisma.paymentRequest.update({ where: { id: r.id }, data: { status: "PAID", remindAt: null } });
  if (r.client.email) {
    const fr = r.language === "fr";
    try {
      const account = await resolveOtpSenderMailbox();
      await gmailSend(account.id, {
        fromEmail: AUTOMATED_NO_REPLY_EMAIL,
        automated: true,
        to: r.client.email,
        subject: fr
          ? `Paiement confirmé — ${r.payment?.reference ?? ""}`
          : `Payment confirmed — ${r.payment?.reference ?? ""}`,
        text: fr
          ? `Bonjour ${r.client.firstName},\n\nVotre paiement de ${r.payment?.currency ?? r.currency} ${Number(r.payment?.amount ?? r.amount).toFixed(2)} pour « ${r.description} » est confirmé (référence ${r.payment?.reference ?? ""}).\n\nMerci,\nJUN CREATIF AND TRAVEL LLC`
          : `Hello ${r.client.firstName},\n\nYour payment of ${r.payment?.currency ?? r.currency} ${Number(r.payment?.amount ?? r.amount).toFixed(2)} for "${r.description}" is confirmed (reference ${r.payment?.reference ?? ""}).\n\nThank you,\nJUN CREATIF AND TRAVEL LLC`,
      });
    } catch {}
  }
}

/** Cron: expire and remind (max 3) unpaid requests. */
export async function processPaymentRequestReminders() {
  const now = new Date();
  await prisma.paymentRequest.updateMany({
    where: { status: { in: ["SENT", "VIEWED"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED", remindAt: null },
  });
  const due = await prisma.paymentRequest.findMany({
    where: { status: { in: ["SENT", "VIEWED"] }, remindAt: { lte: now }, reminderCount: { lt: 3 } },
    take: 20,
    select: { id: true, sentVia: true },
  });
  let reminded = 0;
  for (const r of due) {
    const res = await deliverPaymentRequest(
      r.id,
      (r.sentVia.length ? r.sentVia : ["EMAIL"]) as Array<"EMAIL" | "WHATSAPP">,
      true,
    ).catch(() => null);
    if (res?.sent.length) reminded++;
    else
      await prisma.paymentRequest.update({
        where: { id: r.id },
        data: { remindAt: new Date(Date.now() + 4 * 86_400_000) },
      });
  }
  return { due: due.length, reminded };
}
