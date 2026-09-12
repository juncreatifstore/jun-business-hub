import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const PREFIX = "whatsapp.";
const LEGACY_TEST_TEMPLATE = "hello_world";
export const GENERAL_DOCUMENT_TEMPLATE = "jun_document_notification";
export type WhatsAppConfig = {
  appId: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhone: string;
  graphVersion: string;
  defaultTemplate: string;
  languageCode: string;
  tokenConfigured: boolean;
  webhookVerifyTokenConfigured: boolean;
};

async function rows() {
  const r = await prisma.appSetting.findMany({
    where: { key: { startsWith: PREFIX } },
    select: { key: true, value: true },
  });
  return Object.fromEntries(r.map((x) => [x.key, x.value]));
}
async function set(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const s = await rows();
  const storedTemplate = s["whatsapp.default_template"]?.trim() || "";
  return {
    appId: s["whatsapp.app_id"]?.trim() || "",
    phoneNumberId: s["whatsapp.phone_number_id"] ?? "",
    businessAccountId: s["whatsapp.business_account_id"] ?? "",
    displayPhone: s["whatsapp.display_phone"] ?? "",
    graphVersion: s["whatsapp.graph_version"] ?? "v23.0",
    defaultTemplate: storedTemplate === LEGACY_TEST_TEMPLATE ? "" : storedTemplate,
    languageCode: s["whatsapp.language_code"]?.trim() || "fr",
    tokenConfigured: Boolean(s["whatsapp.access_token_enc"]),
    webhookVerifyTokenConfigured: Boolean(s["whatsapp.webhook_verify_token_enc"]),
  };
}

export async function saveWhatsAppConfig(input: {
  appId: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhone: string;
  graphVersion: string;
  defaultTemplate: string;
  languageCode: string;
  accessToken?: string;
  webhookVerifyToken?: string;
}) {
  const defaultTemplate = input.defaultTemplate.trim();
  const languageCode = input.languageCode.trim() || "fr";
  await Promise.all([
    set("whatsapp.app_id", input.appId.trim()),
    set("whatsapp.phone_number_id", input.phoneNumberId.trim()),
    set("whatsapp.business_account_id", input.businessAccountId.trim()),
    set("whatsapp.display_phone", input.displayPhone.trim()),
    set("whatsapp.graph_version", input.graphVersion.trim() || "v23.0"),
    set("whatsapp.default_template", defaultTemplate),
    set("whatsapp.language_code", languageCode),
    input.accessToken?.trim()
      ? set("whatsapp.access_token_enc", encryptSecret(input.accessToken.trim()))
      : Promise.resolve(),
    input.webhookVerifyToken?.trim()
      ? set("whatsapp.webhook_verify_token_enc", encryptSecret(input.webhookVerifyToken.trim()))
      : Promise.resolve(),
  ]);
}

export async function getWhatsAppWebhookVerifyToken() {
  const s = await rows();
  const enc = s["whatsapp.webhook_verify_token_enc"];
  return enc ? decryptSecret(enc) : "";
}

async function credentials() {
  const s = await rows();
  const enc = s["whatsapp.access_token_enc"],
    phoneNumberId = s["whatsapp.phone_number_id"],
    graphVersion = s["whatsapp.graph_version"] || "v23.0";
  if (!enc || !phoneNumberId) throw new Error("WhatsApp is not configured. Open Settings → WhatsApp.");
  return { token: decryptSecret(enc), phoneNumberId, graphVersion };
}
function normalizePhone(phone: string) {
  const n = phone.replace(/[^0-9]/g, "");
  if (n.length < 8) throw new Error("Invalid WhatsApp number. Use international format, for example +52…");
  return n;
}
async function send(payload: unknown) {
  const c = await credentials();
  const r = await fetch(
    `https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta WhatsApp API ${r.status}: ${JSON.stringify(data)}`);
  return data as { messages?: { id: string }[] };
}

export async function sendWhatsAppText(to: string, body: string) {
  if (!body.trim()) throw new Error("Message is empty");
  return send({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    type: "text",
    text: { preview_url: true, body: body.trim().slice(0, 4096) },
  });
}
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[] = [],
  /** Placeholder names when the template uses named variables ({{customer_name}}). */
  parameterNames: string[] = [],
) {
  const name = templateName.trim();
  if (!name)
    throw new Error(
      "No approved WhatsApp template is configured. Choose Free text for an active 24-hour conversation, or enter the exact approved template name from Meta WhatsApp Manager in Settings → WhatsApp.",
    );
  const language = languageCode.trim() || "fr";
  return send({
    messaging_product: "whatsapp",
    to: normalizePhone(to),
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(bodyParameters.length
        ? {
            components: [
              {
                type: "body",
                parameters: bodyParameters.map((text, i) => ({
                  type: "text",
                  text: text.slice(0, 1024),
                  ...(parameterNames[i] && !/^\d+$/.test(parameterNames[i])
                    ? { parameter_name: parameterNames[i] }
                    : {}),
                })),
              },
            ],
          }
        : {}),
    },
  });
}

export async function sendWhatsAppGeneralTemplate(input: {
  to: string;
  templateName: string;
  languageCode: string;
  clientName: string;
  documentLabel: string;
  reference: string;
}) {
  const name = input.templateName.trim();
  if (!name) throw new Error("No approved document template is configured in Settings → WhatsApp.");
  return send({
    messaging_product: "whatsapp",
    to: normalizePhone(input.to),
    type: "template",
    template: {
      name,
      language: { code: input.languageCode.trim() || "fr" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "customer_name", text: input.clientName.slice(0, 1024) },
            { type: "text", parameter_name: "document_type", text: input.documentLabel.slice(0, 1024) },
            { type: "text", parameter_name: "document_reference", text: input.reference.slice(0, 1024) },
          ],
        },
      ],
    },
  });
}

export async function sendWhatsAppDocumentTemplate(input: {
  to: string;
  templateName: string;
  languageCode: string;
  mediaId: string;
  filename: string;
  clientName: string;
  documentLabel: string;
  reference: string;
}) {
  const name = input.templateName.trim();
  if (!name) throw new Error("No approved document template is configured in Settings → WhatsApp.");
  if (!input.mediaId) throw new Error("WhatsApp media ID is required");
  const language = input.languageCode.trim() || "fr";
  return send({
    messaging_product: "whatsapp",
    to: normalizePhone(input.to),
    type: "template",
    template: {
      name,
      language: { code: language },
      components: [
        {
          type: "header",
          parameters: [
            { type: "document", document: { id: input.mediaId, filename: input.filename.slice(0, 240) } },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "customer_name", text: input.clientName.slice(0, 1024) },
            { type: "text", parameter_name: "document_type", text: input.documentLabel.slice(0, 1024) },
            { type: "text", parameter_name: "document_reference", text: input.reference.slice(0, 1024) },
          ],
        },
      ],
    },
  });
}

export async function uploadWhatsAppMedia(data: Buffer, mimeType: string, filename: string) {
  const c = await credentials();
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType || "application/octet-stream");
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  form.set(
    "file",
    new Blob([bytes.buffer], { type: mimeType || "application/octet-stream" }),
    filename || "document.pdf",
  );
  const r = await fetch(
    `https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.phoneNumberId)}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${c.token}` }, body: form, cache: "no-store" },
  );
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meta WhatsApp media upload ${r.status}: ${JSON.stringify(payload)}`);
  const id = String((payload as { id?: string }).id || "");
  if (!id) throw new Error("Meta did not return a media ID");
  return id;
}

export async function sendWhatsAppDocument(to: string, mediaId: string, filename: string, caption?: string) {
  if (!mediaId) throw new Error("WhatsApp media ID is required");
  return send({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    type: "document",
    document: {
      id: mediaId,
      filename: filename.slice(0, 240),
      ...(caption?.trim() ? { caption: caption.trim().slice(0, 1024) } : {}),
    },
  });
}

/**
 * Download an inbound media object (voice note, image, document…) from Meta.
 * Media is only retained by Meta for ~30 days; callers should cache it.
 */
export async function fetchWhatsAppMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const c = await credentials();
  const meta = await fetch(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${c.token}` },
    cache: "no-store",
  });
  const info = (await meta.json().catch(() => ({}))) as { url?: string; mime_type?: string; error?: unknown };
  if (!meta.ok || !info.url)
    throw new Error(`Meta WhatsApp media lookup ${meta.status}: ${JSON.stringify(info)}`);
  const bin = await fetch(info.url, { headers: { Authorization: `Bearer ${c.token}` }, cache: "no-store" });
  if (!bin.ok) throw new Error(`Meta WhatsApp media download ${bin.status}`);
  return {
    bytes: Buffer.from(await bin.arrayBuffer()),
    mimeType: info.mime_type || "application/octet-stream",
  };
}

/** Tell Meta the message was read: the client sees blue ticks. Best effort. */
export async function sendWhatsAppReadReceipt(messageId: string) {
  if (!messageId) return;
  try {
    await send({ messaging_product: "whatsapp", status: "read", message_id: messageId });
  } catch {
    /* receipts are cosmetic; never surface to the user */
  }
}

/* ───────────── Approved templates ───────────── */

export type ApprovedTemplate = {
  name: string;
  language: string;
  category: string;
  /** Body text with {{1}} (positional) or {{name}} (named) placeholders. */
  body: string;
  paramCount: number;
  /** Placeholder keys in body order: "1","2"… or "customer_name"… */
  params: string[];
  /** True when the template uses named variables (Meta default since 2025). */
  namedParams: boolean;
};

/** Placeholder keys of a template body, in first-appearance order. */
export function templatePlaceholders(body: string) {
  const keys: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) if (!keys.includes(m[1])) keys.push(m[1]);
  const named = keys.some((k) => !/^\d+$/.test(k));
  if (!named) keys.sort((a, b) => Number(a) - Number(b));
  return { keys, named };
}

let templateCache: { at: number; items: ApprovedTemplate[] } | null = null;

/** Approved templates from Meta WhatsApp Manager (cached 10 min per instance). */
export async function listApprovedWhatsAppTemplates(force = false): Promise<ApprovedTemplate[]> {
  if (!force && templateCache && Date.now() - templateCache.at < 10 * 60_000) return templateCache.items;
  const s = await rows();
  const wabaId = String(s["whatsapp.business_account_id"] || "").trim();
  const enc = s["whatsapp.access_token_enc"];
  if (!wabaId || !enc) return [];
  const token = decryptSecret(enc);
  const version = s["whatsapp.graph_version"] || "v23.0";
  const url = `https://graph.facebook.com/${version}/${encodeURIComponent(wabaId)}/message_templates?status=APPROVED&fields=name,language,category,components&limit=100`;
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const data = (await r.json().catch(() => ({}))) as {
      data?: {
        name: string;
        language: string;
        category: string;
        components?: { type: string; text?: string }[];
      }[];
    };
    if (!r.ok) return templateCache?.items ?? [];
    const items: ApprovedTemplate[] = (data.data ?? []).map((t) => {
      const body = t.components?.find((c) => c.type.toUpperCase() === "BODY")?.text ?? "";
      const { keys, named } = templatePlaceholders(body);
      return {
        name: t.name,
        language: t.language,
        category: t.category,
        body,
        paramCount: keys.length,
        params: keys,
        namedParams: named,
      };
    });
    templateCache = { at: Date.now(), items };
    return items;
  } catch {
    return templateCache?.items ?? [];
  }
}

export type OutboundMediaKind = "image" | "video" | "audio" | "document";

/** Send an already-uploaded media object. */
export async function sendWhatsAppMedia(
  to: string,
  kind: OutboundMediaKind,
  mediaId: string,
  opts: { caption?: string; filename?: string } = {},
) {
  if (!mediaId) throw new Error("WhatsApp media ID is required");
  const body: Record<string, unknown> = { id: mediaId };
  if (opts.caption && kind !== "audio") body.caption = opts.caption.slice(0, 1024);
  if (kind === "document" && opts.filename) body.filename = opts.filename.slice(0, 240);
  return send({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(to),
    type: kind,
    [kind]: body,
  });
}

/** Which WhatsApp media type a browser file maps to, or null when Meta won't accept it. */
export function whatsAppMediaKind(mime: string): OutboundMediaKind | null {
  const m = mime.toLowerCase();
  if (m === "image/jpeg" || m === "image/png") return "image";
  if (m === "video/mp4" || m === "video/3gpp") return "video";
  if (
    ["audio/aac", "audio/mp4", "audio/x-m4a", "audio/mpeg", "audio/amr", "audio/ogg"].includes(
      m.split(";")[0],
    )
  )
    return "audio";
  if (
    [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ].includes(m)
  )
    return "document";
  return null;
}
