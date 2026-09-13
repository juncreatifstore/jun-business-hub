import "server-only";
import { prisma } from "@/lib/prisma";
import { listApprovedWhatsAppTemplates, sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/whatsapp";

export const OUTREACH_TEMPLATE_KEY = "whatsapp.outreach.template";
export const OUTREACH_MSG_PREFIX = "whatsapp.outreach.msg.";

export type OutreachTemplate = { name: string; language: string; params: string[] };

function digits(phone: string) {
  return phone.replace(/[^\d]/g, "");
}

/** True when the customer wrote to us in the last 24 h (free-text allowed). */
export async function whatsAppWindowOpen(phone: string) {
  const p = digits(phone);
  if (!p) return false;
  const last = await prisma.activity.findFirst({
    where: {
      type: { in: ["WHATSAPP_INBOUND", "WHATSAPP_INBOUND_UNREAD"] },
      createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      message: { contains: `"phone":"${p}"` },
    },
    select: { id: true },
  });
  return Boolean(last);
}

/** Template used to send a link outside the 24 h window (configured by an admin). */
export async function getOutreachTemplate(): Promise<OutreachTemplate | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: OUTREACH_TEMPLATE_KEY },
    select: { value: true },
  });
  if (row) {
    try {
      const v = JSON.parse(row.value) as OutreachTemplate;
      if (v?.name)
        return {
          name: v.name,
          language: v.language || "fr",
          params: Array.isArray(v.params) ? v.params : [],
        };
    } catch {}
  }
  const env = process.env.WHATSAPP_LINK_TEMPLATE; // "name:lang"
  if (env) {
    const [name, language = "fr"] = env.split(":");
    const approved = (await listApprovedWhatsAppTemplates().catch(() => [])).find(
      (t) => t.name === name && t.language === language,
    );
    return { name, language, params: approved?.params ?? ["1", "2"] };
  }
  return null;
}

export type OutreachResult = { messageId: string | null; via: "TEXT" | "TEMPLATE" };

/**
 * Sends a message carrying a link to a customer:
 * - inside the 24 h window → free text;
 * - outside → the configured outreach template (values: first name, link,
 *   optional subject), or a clear error telling staff what to do.
 * The Meta message id is remembered so a later delivery failure can be tied
 * back to the record (`kind`/`recordId`).
 */
export async function sendWhatsAppLink(input: {
  to: string;
  firstName: string;
  url: string;
  subject: string;
  text: string;
  language?: string;
  kind: string;
  recordId: string;
  userId?: string | null;
}): Promise<OutreachResult> {
  const open = await whatsAppWindowOpen(input.to);
  let result: { messages?: Array<{ id?: string }> } | undefined;
  let via: OutreachResult["via"] = "TEXT";
  if (open) {
    result = (await sendWhatsAppText(input.to, input.text)) as typeof result;
  } else {
    const tpl = await getOutreachTemplate();
    if (!tpl)
      throw new Error(
        "Fenêtre WhatsApp de 24 h fermée et aucun modèle de lien configuré. Envoyez par e-mail, ou configurez un modèle approuvé (Réglages › WhatsApp › Modèle de lien).",
      );
    const values: Record<string, string> = {
      "1": input.firstName,
      "2": input.url,
      "3": input.subject,
      prenom: input.firstName,
      first_name: input.firstName,
      name: input.firstName,
      lien: input.url,
      link: input.url,
      url: input.url,
      objet: input.subject,
      subject: input.subject,
      sujet: input.subject,
    };
    const keys = tpl.params.length ? tpl.params : ["1", "2"];
    const params = keys.map((k) => values[k.toLowerCase()] ?? values[k] ?? "");
    result = (await sendWhatsAppTemplate(
      input.to,
      tpl.name,
      tpl.language || input.language || "fr",
      params,
      keys,
    )) as typeof result;
    via = "TEMPLATE";
  }
  const messageId = result?.messages?.[0]?.id ?? null;
  if (messageId)
    await prisma.appSetting
      .upsert({
        where: { key: `${OUTREACH_MSG_PREFIX}${messageId}` },
        create: {
          key: `${OUTREACH_MSG_PREFIX}${messageId}`,
          value: JSON.stringify({
            kind: input.kind,
            recordId: input.recordId,
            userId: input.userId ?? null,
            to: input.to,
          }),
        },
        update: {
          value: JSON.stringify({
            kind: input.kind,
            recordId: input.recordId,
            userId: input.userId ?? null,
            to: input.to,
          }),
        },
      })
      .catch(() => null);
  return { messageId, via };
}

/** Called by the webhook when Meta reports a failed delivery: undo the "sent via WhatsApp" mark and warn the sender. */
export async function handleOutreachFailure(messageId: string, reason: string) {
  const row = await prisma.appSetting.findUnique({
    where: { key: `${OUTREACH_MSG_PREFIX}${messageId}` },
    select: { value: true },
  });
  if (!row) return false;
  const meta = JSON.parse(row.value) as { kind: string; recordId: string; userId: string | null; to: string };
  const note = `WhatsApp non délivré (${reason.slice(0, 160)})`;
  if (meta.kind === "REFUND_CLAIM") {
    const c = await prisma.refundClaim.findUnique({
      where: { id: meta.recordId },
      select: { sentVia: true, message: true },
    });
    if (c)
      await prisma.refundClaim.update({
        where: { id: meta.recordId },
        data: {
          sentVia: c.sentVia.filter((v) => v !== "WHATSAPP"),
          message: `${c.message ?? ""}\n[${note}]`.trim(),
        },
      });
  } else if (meta.kind === "PAYMENT_REQUEST") {
    const r = await prisma.paymentRequest.findUnique({
      where: { id: meta.recordId },
      select: { sentVia: true },
    });
    if (r)
      await prisma.paymentRequest.update({
        where: { id: meta.recordId },
        data: { sentVia: r.sentVia.filter((v) => v !== "WHATSAPP") },
      });
  } else if (meta.kind === "DOCUMENT_REQUEST") {
    const r = await prisma.documentRequest.findUnique({
      where: { id: meta.recordId },
      select: { sentVia: true },
    });
    if (r)
      await prisma.documentRequest.update({
        where: { id: meta.recordId },
        data: { sentVia: r.sentVia.filter((v) => v !== "WHATSAPP") },
      });
  }
  if (meta.userId)
    await prisma.notification
      .create({
        data: {
          userId: meta.userId,
          type: "WHATSAPP_DELIVERY_FAILED",
          title: "WhatsApp non délivré",
          body: `${note} — ${meta.kind === "REFUND_CLAIM" ? "formulaire de remboursement" : meta.kind === "DOCUMENT_REQUEST" ? "demande de documents" : meta.kind === "PAYMENT_REQUEST" ? "demande de paiement" : meta.kind} vers ${meta.to}. Envoyez par e-mail ou via un modèle approuvé.`,
        },
      })
      .catch(() => null);
  return true;
}
