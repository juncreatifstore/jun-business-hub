import "server-only";
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DOC_TYPE_LABELS, docTypeOf, type DocType } from "@/lib/file-extraction";
import { caseChecklist } from "@/lib/document-requirements";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import { gmailSend } from "@/lib/google/gmail";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export type RequestItem = {
  docType: DocType;
  required: boolean;
  fileId?: string | null;
  fileName?: string | null;
  receivedAt?: string | null;
};
export type RequestStatus = "PENDING" | "PARTIAL" | "COMPLETE" | "CANCELLED" | "EXPIRED";

const FR_LABELS: Partial<Record<DocType, string>> = {
  PASSPORT: "Passeport",
  NATIONAL_ID: "Carte d’identité",
  VISA: "Visa",
  RESIDENCE_PERMIT: "Titre de séjour",
  DRIVER_LICENSE: "Permis de conduire",
  BIRTH_CERTIFICATE: "Acte de naissance",
  MARRIAGE_CERTIFICATE: "Acte de mariage",
  POLICE_RECORD: "Casier judiciaire",
  DIPLOMA: "Diplôme",
  EMPLOYMENT_LETTER: "Attestation d’emploi",
  PAY_SLIP: "Fiche de paie",
  BANK_STATEMENT: "Relevé bancaire",
  TAX_DOCUMENT: "Avis d’imposition",
  FLIGHT_TICKET: "Billet d’avion",
  HOTEL_BOOKING: "Réservation d’hôtel",
  TRAVEL_INSURANCE: "Assurance voyage",
  INVITATION_LETTER: "Lettre d’invitation",
  INVOICE: "Facture",
  RECEIPT: "Reçu",
  PAYMENT_PROOF: "Preuve de paiement",
  CONTRACT: "Contrat",
  POWER_OF_ATTORNEY: "Procuration",
  FORM: "Formulaire",
  LETTER: "Lettre",
  PHOTO: "Photo d’identité",
  OTHER: "Autre document",
};
export function docLabel(t: DocType, lang = "fr") {
  return lang === "fr" ? (FR_LABELS[t] ?? DOC_TYPE_LABELS[t]) : DOC_TYPE_LABELS[t];
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://www.juncreatif.org").replace(/\/$/, "");
}
export function requestUrl(token: string) {
  return `${appBaseUrl()}/r/${token}`;
}

export function parseItems(value: unknown): RequestItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => Boolean(x))
    .map((x) => ({
      docType: docTypeOf(x.docType),
      required: x.required !== false,
      fileId: typeof x.fileId === "string" ? x.fileId : null,
      fileName: typeof x.fileName === "string" ? x.fileName : null,
      receivedAt: typeof x.receivedAt === "string" ? x.receivedAt : null,
    }));
}

export function statusOf(items: RequestItem[]): RequestStatus {
  const required = items.filter((i) => i.required);
  const got = (list: RequestItem[]) => list.filter((i) => i.fileId).length;
  if (required.length ? got(required) === required.length : got(items) === items.length) return "COMPLETE";
  return got(items) ? "PARTIAL" : "PENDING";
}

/** Creates a request for the missing required (and optional) pieces of a case, or explicit types. */
export async function createDocumentRequest(input: {
  clientId: string;
  caseId?: string | null;
  requestedById: string;
  docTypes?: DocType[];
  includeOptional?: boolean;
  message?: string | null;
  language?: string;
  validDays?: number;
}) {
  let items: RequestItem[] = [];
  if (input.docTypes?.length) {
    items = input.docTypes.map((t) => ({ docType: t, required: true }));
  } else if (input.caseId) {
    const cl = await caseChecklist(input.caseId);
    items = (cl?.items ?? [])
      .filter((i) => i.status === "missing" || i.status === "expired")
      .filter((i) => i.required || input.includeOptional)
      .map((i) => ({ docType: i.docType, required: i.required }));
  }
  if (!items.length) throw new Error("Nothing to request: every required document is already on file.");
  const token = randomBytes(24).toString("base64url");
  const validDays = Math.min(90, Math.max(3, input.validDays ?? 30));
  return prisma.documentRequest.create({
    data: {
      token,
      clientId: input.clientId,
      caseId: input.caseId ?? null,
      requestedById: input.requestedById,
      items: items as unknown as Prisma.InputJsonValue,
      message: input.message?.trim() || null,
      language: input.language ?? "fr",
      expiresAt: new Date(Date.now() + validDays * 86_400_000),
      remindAt: new Date(Date.now() + 3 * 86_400_000),
    },
  });
}

function bodyText(input: {
  firstName: string;
  items: RequestItem[];
  message: string | null;
  url: string;
  expiresAt: Date;
  lang: string;
  reminder?: boolean;
}) {
  const fr = input.lang === "fr";
  const missing = input.items.filter((i) => !i.fileId);
  const list = missing
    .map(
      (i) =>
        `  • ${docLabel(i.docType, input.lang)}${i.required ? "" : fr ? " (facultatif)" : " (optional)"}`,
    )
    .join("\n");
  const until = input.expiresAt.toLocaleDateString(fr ? "fr-FR" : "en-US");
  return fr
    ? [
        `Bonjour ${input.firstName},`,
        "",
        input.reminder
          ? "Petit rappel : il nous manque encore les documents suivants pour avancer sur votre dossier :"
          : "Pour avancer sur votre dossier, merci de nous transmettre les documents suivants :",
        list,
        "",
        input.message ? `${input.message}\n` : "",
        "Déposez-les en toute sécurité, sans créer de compte, via ce lien :",
        input.url,
        "",
        `Le lien est valable jusqu’au ${until}. Photos ou PDF acceptés (15 Mo max par fichier).`,
        "",
        "JUN CREATIF AND TRAVEL LLC",
      ]
        .filter((l) => l !== null)
        .join("\n")
    : [
        `Hello ${input.firstName},`,
        "",
        input.reminder
          ? "A quick reminder: we still need the following documents to move your case forward:"
          : "To move your case forward, please send us the following documents:",
        list,
        "",
        input.message ? `${input.message}\n` : "",
        "Upload them securely, no account needed, through this link:",
        input.url,
        "",
        `The link is valid until ${until}. Photos or PDF accepted (15 MB max per file).`,
        "",
        "JUN CREATIF AND TRAVEL LLC",
      ].join("\n");
}

/** Sends (or re-sends) the request by e-mail and/or WhatsApp; returns the channels that worked. */
export async function deliverDocumentRequest(
  requestId: string,
  channels: Array<"EMAIL" | "WHATSAPP">,
  reminder = false,
) {
  const r = await prisma.documentRequest.findUnique({
    where: { id: requestId },
    include: {
      client: { select: { firstName: true, lastName: true, email: true, whatsapp: true, phone: true } },
    },
  });
  if (!r) throw new Error("Request not found");
  const items = parseItems(r.items);
  const url = requestUrl(r.token);
  const text = bodyText({
    firstName: r.client.firstName,
    items,
    message: r.message,
    url,
    expiresAt: r.expiresAt,
    lang: r.language,
    reminder,
  });
  const sent: string[] = [];
  const errors: string[] = [];
  if (channels.includes("EMAIL")) {
    if (!r.client.email) errors.push("Le client n’a pas d’adresse e-mail");
    else {
      try {
        const account = await resolveOtpSenderMailbox();
        await gmailSend(account.id, {
          fromEmail: AUTOMATED_NO_REPLY_EMAIL,
          automated: true,
          to: `${r.client.firstName} ${r.client.lastName} <${r.client.email}>`,
          subject:
            r.language === "fr"
              ? `${reminder ? "Rappel — " : ""}Documents à nous transmettre — ${r.client.firstName}`
              : `${reminder ? "Reminder — " : ""}Documents needed — ${r.client.firstName}`,
          text,
        });
        sent.push("EMAIL");
      } catch (e) {
        errors.push(`E-mail : ${e instanceof Error ? e.message : "échec"}`);
      }
    }
  }
  if (channels.includes("WHATSAPP")) {
    const to = r.client.whatsapp || r.client.phone;
    if (!to) errors.push("Le client n’a pas de numéro WhatsApp");
    else {
      try {
        await sendWhatsAppText(to, text);
        sent.push("WHATSAPP");
      } catch (e) {
        const raw = e instanceof Error ? e.message : "échec";
        errors.push(
          raw.includes("131047") || raw.includes("re-engagement")
            ? "WhatsApp : fenêtre de 24 h fermée — envoyez le lien via un modèle approuvé ou par e-mail"
            : `WhatsApp : ${raw.slice(0, 160)}`,
        );
      }
    }
  }
  if (sent.length) {
    await prisma.documentRequest.update({
      where: { id: r.id },
      data: {
        sentVia: Array.from(new Set([...r.sentVia, ...sent])),
        ...(reminder ? { reminderCount: { increment: 1 } } : {}),
        remindAt: new Date(Date.now() + (reminder ? 4 : 3) * 86_400_000),
      },
    });
  }
  return { sent, errors, url };
}

/** Public view of a request (no personal data beyond first name). */
export async function getPublicRequest(token: string) {
  const r = await prisma.documentRequest.findUnique({
    where: { token },
    include: { client: { select: { firstName: true } } },
  });
  if (!r) return null;
  const items = parseItems(r.items);
  const expired = r.expiresAt.getTime() < Date.now() || r.status === "EXPIRED";
  return {
    id: r.id,
    firstName: r.client.firstName,
    items,
    message: r.message,
    language: r.language,
    status: r.status,
    expiresAt: r.expiresAt,
    expired,
    cancelled: r.status === "CANCELLED",
  };
}

/** Marks an item as received and recomputes the status. */
export async function attachReceivedFile(requestId: string, index: number, fileId: string, fileName: string) {
  const r = await prisma.documentRequest.findUnique({ where: { id: requestId } });
  if (!r) return null;
  const items = parseItems(r.items);
  if (!items[index]) return null;
  items[index] = { ...items[index], fileId, fileName, receivedAt: new Date().toISOString() };
  const status = statusOf(items);
  return prisma.documentRequest.update({
    where: { id: requestId },
    data: {
      items: items as unknown as Prisma.InputJsonValue,
      status,
      completedAt: status === "COMPLETE" ? new Date() : null,
      remindAt: status === "COMPLETE" ? null : r.remindAt,
    },
  });
}

/** Cron: send reminders (max 3) for open requests and expire old ones. */
export async function processDocumentRequestReminders() {
  const now = new Date();
  await prisma.documentRequest.updateMany({
    where: { status: { in: ["PENDING", "PARTIAL"] }, expiresAt: { lt: now } },
    data: { status: "EXPIRED", remindAt: null },
  });
  const due = await prisma.documentRequest.findMany({
    where: { status: { in: ["PENDING", "PARTIAL"] }, remindAt: { lte: now }, reminderCount: { lt: 3 } },
    take: 20,
    select: { id: true, sentVia: true },
  });
  let reminded = 0;
  for (const r of due) {
    const channels = (r.sentVia.length ? r.sentVia : ["EMAIL"]) as Array<"EMAIL" | "WHATSAPP">;
    try {
      const res = await deliverDocumentRequest(r.id, channels, true);
      if (res.sent.length) reminded++;
      else
        await prisma.documentRequest.update({
          where: { id: r.id },
          data: { remindAt: new Date(Date.now() + 4 * 86_400_000) },
        });
    } catch (e) {
      logger.warn("document_request.reminder_failed", { id: r.id, error: e });
    }
  }
  return { expiredChecked: true, due: due.length, reminded };
}
