import "server-only";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { recordOutgoingWhatsAppMessage } from "@/lib/whatsapp-inbox";
import { caseChecklist } from "@/lib/document-requirements";
import { DOC_TYPE_LABELS } from "@/lib/file-extraction";
import { appBaseUrl } from "@/lib/document-requests";
import { logger } from "@/lib/logger";

export const AUTOREPLY_KEY = "whatsapp.autoreply";
const LAST_PREFIX = "whatsapp.autoreply.last.";

export type AutoReplySettings = {
  enabled: boolean;
  timezone: string;
  /** 0 = Sunday … 6 = Saturday; null = closed */
  hours: Record<string, { open: string; close: string } | null>;
  cooldownHours: number;
  outOfHours: { fr: string; en: string };
  inHoursGreeting: { fr: string; en: string };
  includeStatus: boolean;
  signature: string;
};

export const DEFAULT_AUTOREPLY: AutoReplySettings = {
  enabled: true,
  timezone: "America/Santo_Domingo",
  hours: {
    "0": null,
    "1": { open: "09:00", close: "18:00" },
    "2": { open: "09:00", close: "18:00" },
    "3": { open: "09:00", close: "18:00" },
    "4": { open: "09:00", close: "18:00" },
    "5": { open: "09:00", close: "18:00" },
    "6": { open: "09:00", close: "13:00" },
  },
  cooldownHours: 12,
  outOfHours: {
    fr: "Merci pour votre message. Nous sommes actuellement fermés : nos horaires sont du lundi au vendredi de 9 h à 18 h et le samedi de 9 h à 13 h. Un conseiller vous répondra dès la réouverture.",
    en: "Thank you for your message. We are currently closed: our hours are Monday to Friday 9 am–6 pm and Saturday 9 am–1 pm. An advisor will reply as soon as we reopen.",
  },
  inHoursGreeting: {
    fr: "Merci pour votre message, nous avons bien reçu votre demande. Un conseiller vous répond dans les meilleurs délais.",
    en: "Thank you for your message, we received it. An advisor will get back to you shortly.",
  },
  includeStatus: true,
  signature: "JUN Creatif & Travel",
};

export async function getAutoReplySettings(): Promise<AutoReplySettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: AUTOREPLY_KEY }, select: { value: true } });
  if (!row) return DEFAULT_AUTOREPLY;
  try {
    const v = JSON.parse(row.value) as Partial<AutoReplySettings>;
    return {
      ...DEFAULT_AUTOREPLY,
      ...v,
      hours: { ...DEFAULT_AUTOREPLY.hours, ...(v.hours ?? {}) },
      outOfHours: { ...DEFAULT_AUTOREPLY.outOfHours, ...(v.outOfHours ?? {}) },
      inHoursGreeting: { ...DEFAULT_AUTOREPLY.inHoursGreeting, ...(v.inHoursGreeting ?? {}) },
    };
  } catch {
    return DEFAULT_AUTOREPLY;
  }
}
export async function saveAutoReplySettings(v: AutoReplySettings) {
  const value = JSON.stringify(v);
  await prisma.appSetting.upsert({
    where: { key: AUTOREPLY_KEY },
    create: { key: AUTOREPLY_KEY, value },
    update: { value },
  });
}

/** Is it business time now in the configured timezone? */
export function isWithinHours(settings: AutoReplySettings, now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  const slot = settings.hours[String(dayIdx)];
  if (!slot) return false;
  const hm = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  return hm >= slot.open && hm < slot.close;
}

const CASE_STATUS_FR: Record<string, string> = {
  OPEN: "ouvert",
  IN_PROGRESS: "en cours de traitement",
  WAITING_CLIENT: "en attente d’éléments de votre part",
  WAITING_INTERNAL: "en attente d’une étape interne",
};
const CASE_STATUS_EN: Record<string, string> = {
  OPEN: "open",
  IN_PROGRESS: "in progress",
  WAITING_CLIENT: "waiting for items from you",
  WAITING_INTERNAL: "waiting on an internal step",
};
const CLAIM_FR: Record<string, string> = {
  SENT: "formulaire de remboursement à remplir",
  SUBMITTED: "demande de remboursement reçue, en attente d’examen",
  UNDER_REVIEW: "demande de remboursement en cours d’examen",
  NEEDS_INFO: "demande de remboursement : complément attendu de votre part",
  CONVERTED: "remboursement accepté, versement en préparation",
};
const CLAIM_EN: Record<string, string> = {
  SENT: "refund form to complete",
  SUBMITTED: "refund request received, awaiting review",
  UNDER_REVIEW: "refund request under review",
  NEEDS_INFO: "refund request: more information expected from you",
  CONVERTED: "refund approved, payout in preparation",
};

/** Summary of what the client has in progress, in their language. */
export async function clientStatusSummary(clientId: string, lang: "fr" | "en") {
  const fr = lang === "fr";
  const [cases, claims, payReqs, docReqs, refunds, portal] = await Promise.all([
    prisma.case.findMany({
      where: { clientId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CLIENT", "WAITING_INTERNAL"] } },
      select: { id: true, caseNumber: true, title: true, status: true },
      take: 3,
    }),
    prisma.refundClaim.findMany({
      where: { clientId, status: { in: ["SENT", "SUBMITTED", "UNDER_REVIEW", "NEEDS_INFO", "CONVERTED"] } },
      select: { status: true, amount: true, currency: true, token: true },
      take: 2,
    }),
    prisma.paymentRequest.findMany({
      where: { clientId, status: { in: ["SENT", "VIEWED", "PROOF_SUBMITTED"] } },
      select: { description: true, amount: true, currency: true, status: true, token: true },
      take: 2,
    }),
    prisma.documentRequest.findMany({
      where: { clientId, status: { in: ["PENDING", "PARTIAL"] }, expiresAt: { gt: new Date() } },
      select: { token: true },
      take: 1,
    }),
    prisma.refund.findMany({
      where: { clientId, status: { in: ["APPROVED", "PARTIALLY_PAID"] } },
      select: { refundNumber: true, amount: true, currency: true, status: true },
      take: 2,
    }),
    prisma.clientAccount.findUnique({ where: { clientId }, select: { isEnabled: true } }),
  ]);
  const lines: string[] = [];
  for (const c of cases) {
    let extra = "";
    if (c.status === "WAITING_CLIENT") {
      const cl = await caseChecklist(c.id).catch(() => null);
      const missing =
        cl?.items
          .filter((i) => i.required && (i.status === "missing" || i.status === "expired"))
          .map((i) => DOC_TYPE_LABELS[i.docType]) ?? [];
      if (missing.length)
        extra = fr ? ` — pièces attendues : ${missing.join(", ")}` : ` — expected: ${missing.join(", ")}`;
    }
    lines.push(
      `• ${fr ? "Dossier" : "Case"} ${c.caseNumber} (${c.title}) : ${(fr ? CASE_STATUS_FR : CASE_STATUS_EN)[c.status] ?? c.status.toLowerCase()}${extra}`,
    );
  }
  for (const r of claims)
    lines.push(
      `• ${(fr ? CLAIM_FR : CLAIM_EN)[r.status] ?? r.status}${r.amount ? ` (${r.currency} ${Number(r.amount).toFixed(2)})` : ""}${r.status === "SENT" || r.status === "NEEDS_INFO" ? ` — ${appBaseUrl()}/refund/${r.token}` : ""}`,
    );
  for (const r of refunds)
    lines.push(
      `• ${fr ? "Remboursement" : "Refund"} ${r.refundNumber} (${r.currency} ${Number(r.amount).toFixed(2)}) : ${r.status === "PARTIALLY_PAID" ? (fr ? "versement partiel effectué" : "partially paid") : fr ? "approuvé, versement en préparation" : "approved, payout in preparation"}`,
    );
  for (const p of payReqs)
    lines.push(
      `• ${fr ? "Paiement demandé" : "Payment requested"} : ${p.currency} ${Number(p.amount).toFixed(2)} (${p.description}) — ${p.status === "PROOF_SUBMITTED" ? (fr ? "preuve reçue, en cours de confirmation" : "proof received, being confirmed") : `${appBaseUrl()}/p/${p.token}`}`,
    );
  if (docReqs.length)
    lines.push(
      `• ${fr ? "Documents à nous transmettre" : "Documents to send us"} : ${appBaseUrl()}/r/${docReqs[0].token}`,
    );
  const hasAnything = lines.length > 0;
  return { lines, hasAnything, portal: portal?.isEnabled ? `${appBaseUrl()}/client` : null };
}

/**
 * Called after each inbound message. Sends at most one automatic reply per
 * phone per cooldown window: out-of-hours notice and/or the client's
 * in-progress status (case, refund, claim, payment, documents).
 */
export async function maybeAutoReply(input: {
  phone: string;
  clientId: string | null;
  firstName?: string | null;
  country?: string | null;
  text?: string | null;
}) {
  const settings = await getAutoReplySettings();
  if (!settings.enabled) return { sent: false, reason: "disabled" };
  const key = `${LAST_PREFIX}${input.phone}`;
  const last = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  if (last && Date.now() - Number(last.value) < settings.cooldownHours * 3600_000)
    return { sent: false, reason: "cooldown" };
  const usCanada = /^1(?!809|829|849)\d{10}$/.test(input.phone); // +1 outside the Dominican Republic
  const lang: "fr" | "en" =
    /^(US|USA|CA|GB|UK|JM|TT|BS)$/i.test((input.country ?? "").trim()) || (!input.country && usCanada)
      ? "en"
      : "fr";
  const fr = lang === "fr";
  const open = isWithinHours(settings);
  const parts: string[] = [];
  parts.push(`${fr ? "Bonjour" : "Hello"}${input.firstName ? ` ${input.firstName}` : ""},`);
  parts.push(open ? settings.inHoursGreeting[lang] : settings.outOfHours[lang]);
  let status = { hasAnything: false, lines: [] as string[], portal: null as string | null };
  if (settings.includeStatus && input.clientId)
    status = await clientStatusSummary(input.clientId, lang).catch(() => status);
  if (status.hasAnything) {
    parts.push(
      fr
        ? "Pour information, voici où en sont vos démarches :"
        : "For your information, here is where things stand:",
    );
    parts.push(status.lines.join("\n"));
    if (status.portal) parts.push(`${fr ? "Votre espace client" : "Your client portal"} : ${status.portal}`);
  }
  // Nothing to say in business hours for an unknown contact → stay silent (a human will answer).
  if (open && !status.hasAnything) return { sent: false, reason: "in-hours-no-status" };
  parts.push(settings.signature);
  const body = parts.join("\n\n");
  try {
    const result = (await sendWhatsAppText(input.phone, body)) as { messages?: Array<{ id?: string }> };
    const messageId = result?.messages?.[0]?.id ?? `auto-${Date.now()}`;
    await recordOutgoingWhatsAppMessage({
      phone: input.phone,
      messageId,
      type: "text",
      text: `🤖 ${body}`,
      clientId: input.clientId,
      userId: null,
    }).catch(() => null);
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: String(Date.now()) },
      update: { value: String(Date.now()) },
    });
    return { sent: true, reason: open ? "status" : "out-of-hours" };
  } catch (e) {
    logger.warn("whatsapp.autoreply_failed", { phone: input.phone, err: e });
    return { sent: false, reason: "send-failed" };
  }
}
