import "server-only";
import { prisma } from "@/lib/prisma";

export type QuickReply = { label: string; fr: string; ht: string; es: string };

export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  {
    label: "Bien reçu",
    fr: "Bonjour, nous avons bien reçu votre message. Nous revenons vers vous très rapidement.",
    ht: "Bonjou, nou byen resevwa mesaj ou a. N ap reponn ou trè vit.",
    es: "Hola, recibimos su mensaje. Le respondemos muy pronto.",
  },
  {
    label: "Renvoyer le message",
    fr: "Nous n’avons pas pu recevoir votre dernier message. Pouvez-vous le renvoyer en texte, en photo ou en vocal ?",
    ht: "Nou pa t ka resevwa dènye mesaj ou a. Èske ou ka voye l ankò an tèks, foto oswa vokal ?",
    es: "No pudimos recibir su último mensaje. ¿Puede enviarlo de nuevo como texto, foto o audio?",
  },
  {
    label: "Documents manquants",
    fr: "Pour avancer sur votre dossier, merci de nous envoyer les documents demandés (photo lisible ou PDF).",
    ht: "Pou nou avanse ak dosye ou a, tanpri voye dokiman yo (foto klè oswa PDF).",
    es: "Para avanzar con su expediente, envíenos los documentos solicitados (foto legible o PDF).",
  },
  {
    label: "Rappel de paiement",
    fr: "Petit rappel : un paiement est en attente sur votre dossier. Dites-nous si vous avez besoin des informations de paiement.",
    ht: "Ti rapèl : gen yon peman ki an atant sou dosye ou a. Di nou si ou bezwen enfòmasyon pou peye.",
    es: "Recordatorio: hay un pago pendiente en su expediente. Díganos si necesita los datos de pago.",
  },
  {
    label: "Rendez-vous confirmé",
    fr: "Votre rendez-vous est confirmé. Merci d’arriver 10 minutes en avance avec vos documents originaux.",
    ht: "Randevou ou a konfime. Tanpri rive 10 minit anvan ak dokiman orijinal ou yo.",
    es: "Su cita está confirmada. Por favor llegue 10 minutos antes con sus documentos originales.",
  },
  {
    label: "Clôture",
    fr: "Merci pour votre confiance. N’hésitez pas à nous écrire si vous avez d’autres questions.",
    ht: "Mèsi pou konfyans ou. Pa ezite ekri nou si ou gen lòt kesyon.",
    es: "Gracias por su confianza. No dude en escribirnos si tiene otras preguntas.",
  },
];

export async function getQuickReplies(): Promise<QuickReply[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: "whatsapp.quick_replies" } });
  if (!row) return DEFAULT_QUICK_REPLIES;
  try {
    const parsed = JSON.parse(row.value) as QuickReply[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_QUICK_REPLIES;
  } catch {
    return DEFAULT_QUICK_REPLIES;
  }
}
