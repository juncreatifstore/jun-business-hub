import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

/**
 * Real Gmail integration (OAuth 2.0 + Gmail REST API, no heavy SDK).
 * STATUS: READY — CREDENTIALS REQUIRED (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).
 * Refresh tokens are stored AES-256-GCM encrypted (MailAccount.refreshTokenEnc)
 * and are never sent to the browser.
 */

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
    prompt: "consent", // force refresh_token issuance
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

/** Get a valid access token for a connected mailbox, refreshing if needed. */
export async function accessTokenFor(accountId: string): Promise<{ token: string; email: string }> {
  const acc = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!acc || acc.status !== "CONNECTED") throw new Error("Mailbox not connected");
  if (acc.accessToken && acc.tokenExpiry && acc.tokenExpiry.getTime() > Date.now() + 60_000) {
    return { token: acc.accessToken, email: acc.email };
  }
  if (!acc.refreshTokenEnc) throw new Error("No refresh token — reconnect the mailbox");
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
  if (!res.ok) {
    await prisma.mailAccount.update({ where: { id: acc.id }, data: { status: "ERROR" } });
    throw new Error(`Google token refresh failed: ${await res.text()}`);
  }
  const t = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.mailAccount.update({
    where: { id: acc.id },
    data: { accessToken: t.access_token, tokenExpiry: new Date(Date.now() + t.expires_in * 1000), status: "CONNECTED" },
  });
  return { token: t.access_token, email: acc.email };
}

export async function saveConnectedAccount(input: { email: string; accessToken: string; refreshToken?: string; expiresIn: number; scope: string; connectedById: string }) {
  return prisma.mailAccount.upsert({
    where: { email: input.email },
    update: {
      accessToken: input.accessToken,
      tokenExpiry: new Date(Date.now() + input.expiresIn * 1000),
      ...(input.refreshToken ? { refreshTokenEnc: encryptSecret(input.refreshToken) } : {}),
      scope: input.scope,
      status: "CONNECTED",
    },
    create: {
      email: input.email,
      accessToken: input.accessToken,
      tokenExpiry: new Date(Date.now() + input.expiresIn * 1000),
      refreshTokenEnc: input.refreshToken ? encryptSecret(input.refreshToken) : null,
      scope: input.scope,
      connectedById: input.connectedById,
    },
  });
}

// ── Gmail REST helpers ────────────────────────────────────────────────────────
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`Gmail API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type GmailHeader = { name: string; value: string };
type GmailMessage = { id: string; threadId: string; snippet?: string; labelIds?: string[]; payload?: { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[] }; internalDate?: string };

function header(m: GmailMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(m: GmailMessage): string {
  const b64 = (d?: string) => (d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "");
  const findPart = (parts: NonNullable<GmailMessage["payload"]>["parts"], mime: string): string => {
    for (const p of parts ?? []) {
      if (p.mimeType === mime && p.body?.data) return b64(p.body.data);
      const nested = findPart(p.parts as never, mime);
      if (nested) return nested;
    }
    return "";
  };
  if (m.payload?.body?.data) return b64(m.payload.body.data);
  return findPart(m.payload?.parts, "text/plain") || findPart(m.payload?.parts, "text/html");
}

const FOLDER_QUERY: Record<string, string> = { INBOX: "in:inbox", SENT: "in:sent", DRAFTS: "in:drafts", IMPORTANT: "is:important" };

/** Sync up to `max` recent threads for a folder into EmailThread/EmailMessage. Returns count of new messages. */
export async function syncFolder(accountId: string, folder: "INBOX" | "SENT" | "DRAFTS" | "IMPORTANT", max = 25): Promise<number> {
  const { token } = await accessTokenFor(accountId);
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(token, `/messages?maxResults=${max}&q=${encodeURIComponent(FOLDER_QUERY[folder])}`);
  let created = 0;
  for (const ref of list.messages ?? []) {
    const exists = await prisma.emailMessage.findUnique({ where: { gmailId: ref.id }, select: { id: true } });
    if (exists) continue;
    const m = await gmail<GmailMessage>(token, `/messages/${ref.id}?format=full`);
    const subject = header(m, "Subject") || "(no subject)";
    const fromAddr = header(m, "From");
    const toAddr = header(m, "To");
    const unread = (m.labelIds ?? []).includes("UNREAD");
    const body = decodeBody(m).slice(0, 100_000);

    // Auto-associate client by sender/recipient email
    const emails = `${fromAddr} ${toAddr}`.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
    const client = emails.length
      ? await prisma.client.findFirst({ where: { email: { in: emails.map((e) => e.toLowerCase()) } }, select: { id: true } })
      : null;

    const thread = await prisma.emailThread.upsert({
      where: { gmailThreadId: m.threadId },
      update: { unread, folder },
      create: { gmailThreadId: m.threadId, subject, folder, unread, clientId: client?.id ?? null },
    });
    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        gmailId: m.id,
        fromAddr: fromAddr.slice(0, 300),
        toAddr: toAddr.slice(0, 300),
        body,
        snippet: m.snippet?.slice(0, 300) ?? null,
        isDraft: folder === "DRAFTS",
        sentAt: m.internalDate ? new Date(Number(m.internalDate)) : null,
      },
    });
    created += 1;
  }
  return created;
}

/** Send an email through the connected mailbox. Returns the Gmail message id. */
export async function gmailSend(accountId: string, input: { to: string; subject: string; text: string; inReplyToGmailId?: string }): Promise<string> {
  const { token, email } = await accessTokenFor(accountId);
  const headers = [
    `From: ${email}`,
    `To: ${input.to}`,
    `Subject: ${input.subject.replace(/[\r\n]/g, " ")}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
  ];
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.text}`).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await gmail<{ id: string }>(token, "/messages/send", { method: "POST", body: JSON.stringify({ raw }) });
  return res.id;
}

export async function markGmailRead(accountId: string, gmailThreadId: string): Promise<void> {
  const { token } = await accessTokenFor(accountId);
  await gmail(token, `/threads/${gmailThreadId}/modify`, { method: "POST", body: JSON.stringify({ removeLabelIds: ["UNREAD"] }) });
}
