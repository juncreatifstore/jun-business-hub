import "server-only";
import { prisma } from "@/lib/prisma";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";
import { resolveOtpSenderMailbox } from "@/lib/mail-otp-sender";
import { gmailSend } from "@/lib/google/gmail";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { whatsAppWindowOpen } from "@/lib/whatsapp-outreach";
import { appBaseUrl } from "@/lib/document-requests";
import { caseChecklist } from "@/lib/document-requirements";
import { DOC_TYPE_LABELS } from "@/lib/file-extraction";

const FR: Record<string, { title: string; body: string }> = {
  OPEN: {
    title: "Votre dossier est ouvert",
    body: "Nous avons ouvert votre dossier et commençons son traitement.",
  },
  IN_PROGRESS: {
    title: "Votre dossier est en cours de traitement",
    body: "Votre dossier avance : notre équipe travaille dessus en ce moment.",
  },
  WAITING_CLIENT: {
    title: "Votre dossier attend une action de votre part",
    body: "Nous avons besoin de vous pour continuer : merci de consulter les documents ou paiements demandés.",
  },
  WAITING_INTERNAL: {
    title: "Votre dossier est en attente d’une étape interne",
    body: "Une étape est en cours de notre côté (vérification, dépôt, réponse d’une administration). Rien à faire pour vous pour l’instant.",
  },
  COMPLETED: {
    title: "Votre dossier est terminé",
    body: "Votre dossier est clôturé. Merci de votre confiance ; les documents finaux sont disponibles dans votre espace.",
  },
  CANCELLED: {
    title: "Votre dossier a été annulé",
    body: "Votre dossier a été annulé. Contactez-nous pour toute question.",
  },
};
const EN: Record<string, { title: string; body: string }> = {
  OPEN: { title: "Your case is open", body: "We opened your case and started working on it." },
  IN_PROGRESS: {
    title: "Your case is in progress",
    body: "Your case is moving forward: our team is working on it now.",
  },
  WAITING_CLIENT: {
    title: "Your case needs your action",
    body: "We need something from you to continue: please check the requested documents or payments.",
  },
  WAITING_INTERNAL: {
    title: "Your case is waiting on an internal step",
    body: "A step is in progress on our side (verification, filing, answer from an authority). Nothing to do for now.",
  },
  COMPLETED: {
    title: "Your case is completed",
    body: "Your case is closed. Thank you for your trust; final documents are available in your portal.",
  },
  CANCELLED: {
    title: "Your case was cancelled",
    body: "Your case has been cancelled. Contact us with any question.",
  },
};

/**
 * Tells the client about a case status change: e-mail (always when an address
 * exists) and WhatsApp text when the 24 h window is open. Includes the missing
 * pieces when the case waits on the client, and the portal link when the
 * client has an account.
 */
export async function notifyClientCaseStatus(caseId: string, status: string, note?: string | null) {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    select: {
      caseNumber: true,
      title: true,
      clientId: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          whatsapp: true,
          phone: true,
          country: true,
          account: { select: { isEnabled: true } },
        },
      },
    },
  });
  if (!c) return { sent: [] as string[] };
  // No language field on Client: English for US/CA/GB/JM/TT clients, French otherwise.
  const lang = /^(US|USA|CA|GB|UK|JM|TT|BS)$/i.test((c.client.country ?? "").trim()) ? "en" : "fr";
  const t = (lang === "fr" ? FR : EN)[status];
  if (!t) return { sent: [] as string[] };
  let missingLine = "";
  if (status === "WAITING_CLIENT") {
    const cl = await caseChecklist(caseId).catch(() => null);
    const missing =
      cl?.items
        .filter((i) => i.required && (i.status === "missing" || i.status === "expired"))
        .map((i) => DOC_TYPE_LABELS[i.docType]) ?? [];
    if (missing.length)
      missingLine =
        lang === "fr"
          ? `\n\nPièces attendues : ${missing.join(", ")}.`
          : `\n\nExpected documents: ${missing.join(", ")}.`;
  }
  const portal = c.client.account?.isEnabled
    ? `\n\n${lang === "fr" ? "Votre espace client" : "Your client portal"} : ${appBaseUrl()}/client`
    : "";
  const text = `${lang === "fr" ? "Bonjour" : "Hello"} ${c.client.firstName},\n\n${t.body}${missingLine}${note ? `\n\n${note}` : ""}${portal}\n\n${lang === "fr" ? "Dossier" : "Case"} ${c.caseNumber} — ${c.title}\nJUN CREATIF AND TRAVEL LLC`;
  const sent: string[] = [];
  if (c.client.email) {
    try {
      const account = await resolveOtpSenderMailbox();
      await gmailSend(account.id, {
        fromEmail: AUTOMATED_NO_REPLY_EMAIL,
        automated: true,
        to: `${c.client.firstName} ${c.client.lastName} <${c.client.email}>`,
        subject: `${t.title} — ${c.caseNumber}`,
        text,
      });
      sent.push("EMAIL");
    } catch {}
  }
  const phone = c.client.whatsapp || c.client.phone;
  if (phone && (await whatsAppWindowOpen(phone).catch(() => false))) {
    try {
      await sendWhatsAppText(phone, text);
      sent.push("WHATSAPP");
    } catch {}
  }
  return { sent };
}
