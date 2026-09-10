import "server-only";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { fetchWhatsAppMedia } from "@/lib/whatsapp";
import { decodeWhatsAppInboxPayload } from "@/lib/whatsapp-inbox";
import { logger } from "@/lib/logger";

/**
 * AI helpers for the WhatsApp inbox (OpenAI). Everything is opt-in on
 * OPENAI_API_KEY; without it the helpers return null and the UI hides itself.
 * Results are cached in AppSetting so a transcript or translation is paid once.
 */

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const whatsAppAIEnabled = () => Boolean(process.env.OPENAI_API_KEY);

async function chat(messages: { role: "system" | "user" | "assistant"; content: string }[], json = false) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      logger.warn("whatsapp_ai.chat_failed", { status: res.status });
      return null;
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content as string | undefined) ?? null;
  } catch (err) {
    logger.warn("whatsapp_ai.chat_error", { err });
    return null;
  }
}

const cacheKey = (kind: string, id: string) => `whatsapp.ai.${kind}.${id}`;

async function cached<T>(kind: string, id: string, compute: () => Promise<T | null>): Promise<T | null> {
  const key = cacheKey(kind, id);
  const hit = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  if (hit) {
    try {
      return JSON.parse(hit.value) as T;
    } catch {}
  }
  const value = await compute();
  if (value !== null) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: { value: JSON.stringify(value) },
    });
  }
  return value;
}

export type Transcript = { text: string; language: string; french: string | null };

/** Transcribe a voice note (Whisper handles Haitian Creole, Spanish, French) and add a French rendering. */
export async function transcribeWhatsAppAudio(mediaId: string): Promise<Transcript | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return cached<Transcript>("transcript", mediaId, async () => {
    let bytes: Buffer;
    let mime = "audio/ogg";
    try {
      bytes = await storage().download(`whatsapp/media/${mediaId}`);
    } catch {
      const f = await fetchWhatsAppMedia(mediaId);
      bytes = f.bytes;
      mime = f.mimeType;
    }
    const form = new FormData();
    const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("mpeg") ? "mp3" : "ogg";
    form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), `voice.${ext}`);
    form.set("model", "whisper-1");
    form.set("response_format", "verbose_json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      logger.warn("whatsapp_ai.transcribe_failed", { mediaId, status: res.status });
      return null;
    }
    const data = (await res.json()) as { text?: string; language?: string };
    const text = (data.text ?? "").trim();
    if (!text) return null;
    const language = data.language ?? "unknown";
    const french = /^(fr|french)$/i.test(language) ? null : await translateToFrench(text);
    return { text, language, french };
  });
}

export async function translateToFrench(text: string): Promise<string | null> {
  const out = await chat([
    {
      role: "system",
      content:
        "Tu traduis fidèlement en français des messages WhatsApp de clients (créole haïtien, espagnol, anglais). Réponds uniquement par la traduction, sans commentaire.",
    },
    { role: "user", content: text },
  ]);
  return out?.trim() || null;
}

/** Cached translation of an inbound text message. */
export async function translateWhatsAppMessage(messageId: string, text: string) {
  return cached<{ french: string }>("translation", messageId, async () => {
    const french = await translateToFrench(text);
    return french ? { french } : null;
  });
}

async function conversationContext(phone: string, limit = 24) {
  const rows = await prisma.activity.findMany({
    where: {
      resourceType: "WhatsAppConversation",
      resourceId: phone,
      type: { in: ["WHATSAPP_INBOUND_UNREAD", "WHATSAPP_INBOUND_READ", "WHATSAPP_OUTBOUND_REPLY"] },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { message: true, createdAt: true, client: { select: { firstName: true, lastName: true } } },
  });
  const lines: string[] = [];
  let client: string | null = null;
  for (const r of rows.reverse()) {
    const p = decodeWhatsAppInboxPayload(r.message);
    if (!p) continue;
    if (r.client) client = `${r.client.firstName} ${r.client.lastName}`;
    let text = p.text;
    if (p.type === "audio" && p.mediaId) {
      const t = await prisma.appSetting.findUnique({ where: { key: cacheKey("transcript", p.mediaId) } });
      if (t) {
        try {
          const tr = JSON.parse(t.value) as Transcript;
          text = `[vocal] ${tr.text}`;
        } catch {}
      } else text = "[vocal non transcrit]";
    }
    lines.push(
      `${p.direction === "INBOUND" ? "CLIENT" : "JUN"} (${r.createdAt.toISOString().slice(0, 16)}): ${text}`,
    );
  }
  return { transcript: lines.join("\n"), client };
}

const HOUSE_STYLE =
  "Tu es l'assistant de JUN CREATIF AND TRAVEL LLC (services de voyage, immigration et démarches administratives pour une clientèle haïtienne, mexicaine et internationale). Style : chaleureux, professionnel, phrases courtes, tutoiement uniquement si le client tutoie. Jamais de promesse sur un résultat administratif. Réponds dans la langue du client (créole haïtien, espagnol, français ou anglais).";

export type Draft = { language: string; reply: string; french: string; summary: string };

/** Summary + suggested reply in the client's language, with a French rendering for the agent. */
export async function draftWhatsAppReply(phone: string, instruction?: string): Promise<Draft | null> {
  const ctx = await conversationContext(phone);
  if (!ctx.transcript) return null;
  const out = await chat(
    [
      { role: "system", content: HOUSE_STYLE },
      {
        role: "user",
        content: `Conversation WhatsApp${ctx.client ? ` avec ${ctx.client}` : ""} :\n\n${ctx.transcript}\n\n${
          instruction ? `Consigne de l'agent : ${instruction}\n\n` : ""
        }Réponds en JSON avec les clés : language (code ISO de la langue du client), summary (résumé en français en 2 phrases : où en est la demande, ce que le client attend), reply (proposition de réponse dans la langue du client, prête à envoyer), french (la même réponse en français).`,
      },
    ],
    true,
  );
  if (!out) return null;
  try {
    const d = JSON.parse(out) as Partial<Draft>;
    if (!d.reply) return null;
    return {
      language: d.language ?? "?",
      reply: d.reply,
      french: d.french ?? d.reply,
      summary: d.summary ?? "",
    };
  } catch {
    return null;
  }
}

/** Translate the agent's French draft into the client's language. */
export async function translateDraftForClient(phone: string, draft: string): Promise<string | null> {
  const ctx = await conversationContext(phone, 8);
  const out = await chat([
    { role: "system", content: HOUSE_STYLE },
    {
      role: "user",
      content: `Derniers échanges :\n${ctx.transcript}\n\nTraduis ce brouillon dans la langue utilisée par le client (si le client écrit en français, renvoie le texte tel quel). Réponds uniquement par le texte final.\n\n${draft}`,
    },
  ]);
  return out?.trim() || null;
}
