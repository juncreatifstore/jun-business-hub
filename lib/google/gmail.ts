import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

export function googleAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number; email: string; scope: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } });
  const info = (await who.json()) as { email?: string };
  if (!info.email) throw new Error("Could not read the Google account email");
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in, email: info.email, scope: t.scope };
}

export async function accessTokenFor(accountId: string): Promise<{ token: string; email: string }> {
  const acc = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!acc) throw new Error("Mailbox not found");
  if (acc.accessTokenEnc && acc.tokenExpiry && acc.tokenExpiry.getTime() > Date.now() + 60_000) {
    return { token: decryptSecret(acc.accessTokenEnc), email: acc.email };
  }
  if (!acc.refreshTokenEnc) throw new Error("Mailbox not connected — reconnect it in Settings → Email");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: decryptSecret(acc.refreshTokenEnc),
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const t = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.mailAccount.update({
    where: { id: acc.id },
    data: { accessTokenEnc: encryptSecret(t.access_token), tokenExpiry: new Date(Date.now() + t.expires_in * 1000) },
  });
  return { token: t.access_token, email: acc.email };
}

export async function saveConnectedAccount(input: { email: string; accessToken: string; refreshToken?: string; expiresIn: number; scope: string; connectedById: string }) {
  return prisma.mailAccount.upsert({
    where: { email: input.email },
    update: {
      accessTokenEnc: encryptSecret(input.accessToken),
      tokenExpiry: new Date(Date.now() + input.expiresIn * 1000),
      ...(input.refreshToken ? { refreshTokenEnc: encryptSecret(input.refreshToken) } : {}),
    },
    create: {
      email: input.email,
      accessTokenEnc: encryptSecret(input.accessToken),
      refreshTokenEnc: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      tokenExpiry: new Date(Date.now() + input.expiresIn * 1000),
    },
  });
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`Gmail API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type GmailHeader = { name: string; value: string };
type GmailMessage = { id: string; threadId: string; snippet?: string; payload?: { headers?: GmailHeader[]; body?: { data?: string }; parts?: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[] }; internalDate?: string };

function header(m: GmailMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(m: GmailMessage): string {
  const b64 = (d?: string) => (d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");
  const walk = (parts: NonNullable<GmailMessage["payload"]>["parts"]): string => {
    for (const p of parts ?? []) {
      if (p.mimeType === "text/plain" && p.body?.data) return b64(p.body.data);
      const nested = walk(p.parts as never);
      if (nested) return nested;
    }
    return "";
  };
  return b64(m.payload?.body?.data) || walk(m.payload?.parts);
}

const FOLDER_QUERY: Record<string, string> = { INBOX: "in:inbox", SENT: "in:sent", DRAFTS: "in:drafts", IMPORTANT: "is:important" };

export async function syncFolder(accountId: string, folder: "INBOX" | "SENT" | "DRAFTS" | "IMPORTANT", max = 25): Promise<number> {
  const { token } = await accessTokenFor(accountId);
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(token, `/messages?maxResults=${max}&q=${encodeURIComponent(FOLDER_QUERY[folder])}`);
  let created = 0;
  for (const ref of list.messages ?? []) {
    const m = await gmail<GmailMessage>(token, `/messages/${ref.id}?format=full`);
    const subject = header(m, "Subject") || "(no subject)";
    const from = header(m, "From");
    const to = header(m, "To");
    const body = decodeBody(m).slice(0, 20_000);
    const snippet = m.snippet?.slice(0, 500) || body.slice(0, 500) || null;
    const emails = `${from} ${to}`.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
    const client = emails.length ? await prisma.client.findFirst({ where: { email: { in: emails.map((e) => e.toLowerCase()) } }, select: { id: true } }) : null;
    const existing = await prisma.mailThread.findUnique({ where: { gmailThreadId: m.threadId }, select: { id: true } });
    const when = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
    await prisma.mailThread.upsert({
      where: { gmailThreadId: m.threadId },
      update: {
        subject,
        snippet,
        fromEmail: from.slice(0, 300) || null,
        toEmails: emails,
        lastMessageAt: when,
        ...(client ? { clientId: client.id } : {}),
        ...(folder === "IMPORTANT" ? { requiresAttention: true } : {}),
        ...(folder === "DRAFTS" ? { aiDraft: body || m.snippet || "" } : {}),
      },
      create: {
        gmailThreadId: m.threadId,
        mailAccountId: accountId,
        clientId: client?.id ?? null,
        subject,
        snippet,
        fromEmail: from.slice(0, 300) || null,
        toEmails: emails,
        lastMessageAt: when,
        requiresAttention: folder === "IMPORTANT",
        aiDraft: folder === "DRAFTS" ? body || m.snippet || "" : null,
      },
    });
    if (!existing) created += 1;
  }
  return created;
}

type GmailAttachment = {
  filename: string;
  mimeType: string;
  data: Buffer | Uint8Array;
};

function safeHeaderValue(value: string) {
  return value.replace(/[\r\n]/g, " ");
}

function safeFilename(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "attachment";
}

function base64Lines(data: Buffer | Uint8Array) {
  return Buffer.from(data).toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function gmailSend(accountId: string, input: { to: string; subject: string; text: string; inReplyToGmailId?: string; attachments?: GmailAttachment[] }): Promise<string> {
  const { token, email } = await accessTokenFor(accountId);
  const attachments = input.attachments ?? [];
  const common = [
    `From: ${safeHeaderValue(email)}`,
    `To: ${safeHeaderValue(input.to)}`,
    `Subject: ${safeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
  ];

  let message: string;
  if (!attachments.length) {
    message = `${[...common, 'Content-Type: text/plain; charset="UTF-8"'].join("\r\n")}\r\n\r\n${input.text}`;
  } else {
    const boundary = `jun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      input.text,
    ];
    for (const attachment of attachments) {
      const filename = safeFilename(attachment.filename);
      parts.push(
        `--${boundary}`,
        `Content-Type: ${safeHeaderValue(attachment.mimeType || "application/octet-stream")}; name="${filename}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${filename}"`,
        "",
        base64Lines(attachment.data),
      );
    }
    parts.push(`--${boundary}--`, "");
    message = `${[...common, `Content-Type: multipart/mixed; boundary="${boundary}"`].join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  }

  const raw = base64Url(message);
  const res = await gmail<{ id: string }>(token, "/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
  return res.id;
}

export async function markGmailRead(accountId: string, gmailThreadId: string): Promise<void> {
  const { token } = await accessTokenFor(accountId);
  await gmail(token, `/threads/${gmailThreadId}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) });
}
