import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getMailThreadState, saveMailThreadState } from "@/lib/mail-thread-state";
import { isClientCommunicationBanned } from "@/lib/client-communication-policy";
import { detectSignatureEmailBounce } from "@/lib/signature-email-bounce";
import { AUTOMATED_NO_REPLY_EMAIL } from "@/lib/email-aliases";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/admin.directory.user.alias.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI,
  );
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

export async function exchangeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number; email: string; scope: string }> {
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
  const t = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  });
  const info = (await who.json()) as { email?: string };
  if (!info.email) throw new Error("Could not read the Google account email");
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresIn: t.expires_in,
    email: info.email,
    scope: t.scope,
  };
}

export async function accessTokenFor(accountId: string): Promise<{ token: string; email: string }> {
  const acc = await prisma.mailAccount.findUnique({ where: { id: accountId } });
  if (!acc) throw new Error("Mailbox not found");
  if (acc.accessTokenEnc && acc.tokenExpiry && acc.tokenExpiry.getTime() > Date.now() + 60_000)
    return { token: decryptSecret(acc.accessTokenEnc), email: acc.email };
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
    data: {
      accessTokenEnc: encryptSecret(t.access_token),
      tokenExpiry: new Date(Date.now() + t.expires_in * 1000),
    },
  });
  return { token: t.access_token, email: acc.email };
}

export async function saveConnectedAccount(input: {
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
  connectedById: string;
}) {
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
  const res = await fetch(`${GMAIL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Gmail API ${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

type GmailHeader = { name: string; value: string };
type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string };
    parts?: { mimeType?: string; body?: { data?: string }; parts?: unknown[] }[];
  };
  internalDate?: string;
};
type GmailLabel = {
  id: string;
  name: string;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
};
function header(m: GmailMessage, name: string) {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
/** All values of a repeatable header (e.g. several Delivered-To on alias delivery). */
function headers(m: GmailMessage, name: string) {
  return (m.payload?.headers ?? [])
    .filter((h) => h.name.toLowerCase() === name.toLowerCase())
    .map((h) => h.value);
}
/**
 * Every address the message was sent from or delivered to. Alias routing
 * (contact@ → admin@) often leaves the alias only in Cc, Bcc or Delivered-To,
 * so reading just From + To would lose the service the mail belongs to.
 */
const RECIPIENT_HEADERS = ["To", "Cc", "Bcc", "Delivered-To", "X-Original-To", "X-Forwarded-To"];
function participantEmails(m: GmailMessage, from: string) {
  const raw = [from, ...RECIPIENT_HEADERS.flatMap((h) => headers(m, h))].join(" ");
  return Array.from(new Set((raw.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []).map((e) => e.toLowerCase())));
}
function decodeBody(m: GmailMessage) {
  const b64 = (d?: string) =>
    d ? Buffer.from(d.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
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

export async function getGmailSystemLabelStats(accountId: string) {
  const { token } = await accessTokenFor(accountId);
  const ids = ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "STARRED", "IMPORTANT"] as const;
  const rows = await Promise.all(
    ids.map(async (id) => {
      try {
        return await gmail<GmailLabel>(token, `/labels/${id}`);
      } catch {
        return { id, name: id } as GmailLabel;
      }
    }),
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        messagesTotal: r.messagesTotal ?? 0,
        messagesUnread: r.messagesUnread ?? 0,
        threadsTotal: r.threadsTotal ?? 0,
        threadsUnread: r.threadsUnread ?? 0,
      },
    ]),
  ) as Record<
    string,
    { messagesTotal: number; messagesUnread: number; threadsTotal: number; threadsUnread: number }
  >;
}

const FOLDER_QUERY: Record<string, string> = {
  INBOX: "in:inbox",
  SENT: "in:sent",
  DRAFTS: "in:drafts",
  IMPORTANT: "is:important",
};
async function syncStateFromLabels(threadId: string, labelIds: string[] | undefined) {
  const labels = new Set(labelIds ?? []),
    current = await getMailThreadState(threadId);
  const next = {
    ...current,
    isRead: !labels.has("UNREAD"),
    starred: labels.has("STARRED"),
    trashed: labels.has("TRASH"),
    archived:
      !labels.has("INBOX") &&
      !labels.has("TRASH") &&
      !labels.has("SPAM") &&
      !labels.has("SENT") &&
      !labels.has("DRAFT"),
    updatedAt: new Date().toISOString(),
    updatedById: null,
  };
  if (
    current.starred !== next.starred ||
    current.trashed !== next.trashed ||
    current.archived !== next.archived ||
    current.isRead !== next.isRead
  )
    await saveMailThreadState(next);
}

const SYNC_FETCH_CONCURRENCY = 5;
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function syncFolder(
  accountId: string,
  folder: "INBOX" | "SENT" | "DRAFTS" | "IMPORTANT",
  max = 250,
): Promise<number> {
  const { token, email: accountEmail } = await accessTokenFor(accountId);
  let created = 0,
    seen = 0,
    pageToken: string | undefined;
  const processedThreads = new Set<string>();
  while (seen < max) {
    const pageSize = Math.min(100, max - seen);
    const path = `/messages?maxResults=${pageSize}&q=${encodeURIComponent(FOLDER_QUERY[folder])}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const list = await gmail<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(
      token,
      path,
    );
    const refs = list.messages ?? [];
    if (!refs.length) break;
    // One query for every thread of this page: lets us skip the expensive
    // `format=full` download when nothing new arrived in a thread.
    const known = new Map(
      (
        await prisma.mailThread.findMany({
          where: { mailAccountId: accountId, gmailThreadId: { in: refs.map((r) => r.threadId) } },
          select: { id: true, gmailThreadId: true, lastMessageAt: true },
        })
      ).map((t) => [t.gmailThreadId, t]),
    );
    // Network phase — Gmail round trips run in small parallel batches (well
    // under the 250 quota units/s/user: messages.get costs 5). DB writes stay
    // sequential in the phase below.
    const pending = refs.filter((ref) => {
      seen++;
      if (processedThreads.has(ref.threadId)) return false;
      processedThreads.add(ref.threadId);
      return true;
    });
    const fetched = await mapLimit(pending, SYNC_FETCH_CONCURRENCY, async (ref) => {
      const existingRow = known.get(ref.threadId);
      if (existingRow?.lastMessageAt && folder !== "DRAFTS") {
        const brief = await gmail<{ internalDate?: string; labelIds?: string[] }>(
          token,
          `/messages/${ref.id}?format=minimal`,
        );
        const at = brief.internalDate ? Number(brief.internalDate) : 0;
        if (at && at <= existingRow.lastMessageAt.getTime()) {
          return { ref, existingRow, unchangedLabels: brief.labelIds ?? [], m: null };
        }
      }
      const m = await gmail<GmailMessage>(token, `/messages/${ref.id}?format=full`);
      return { ref, existingRow, unchangedLabels: null, m };
    });
    for (const item of fetched) {
      const { existingRow } = item;
      if (item.m === null) {
        // Unchanged thread: only mirror read/star flags.
        await syncStateFromLabels(existingRow!.id, item.unchangedLabels ?? undefined);
        continue;
      }
      const m = item.m;
      const subject = header(m, "Subject") || "(no subject)",
        from = header(m, "From"),
        body = decodeBody(m).slice(0, 20_000),
        snippet = m.snippet?.slice(0, 500) || body.slice(0, 500) || null;
      const emails = participantEmails(m, from);
      const client = emails.length
        ? await prisma.client.findFirst({
            where: { email: { in: emails.map((e) => e.toLowerCase()) } },
            select: { id: true },
          })
        : null;
      const when = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
      if (folder === "INBOX") {
        await detectSignatureEmailBounce({
          accountId,
          accountEmail,
          gmailMessageId: m.id,
          subject,
          from,
          body,
          snippet,
          receivedAt: when,
        }).catch(() => null);
      }
      if (folder === "INBOX" && client && (await isClientCommunicationBanned(client.id))) {
        await gmail(token, `/threads/${m.threadId}/modify`, {
          method: "POST",
          body: JSON.stringify({ addLabelIds: ["TRASH"], removeLabelIds: ["INBOX", "UNREAD"] }),
        }).catch(() => null);
        await prisma.activity
          .create({
            data: {
              clientId: client.id,
              type: "CLIENT_COMMUNICATION_BLOCKED_INBOUND",
              message: `Inbound email auto-trashed · ${subject}`,
              resourceType: "Client",
              resourceId: client.id,
            },
          })
          .catch(() => null);
        continue;
      }
      // Atomic upsert on the (mailAccountId, gmailThreadId) unique key: the same
      // Gmail thread may legitimately appear in several connected mailboxes
      // (aliases of one Workspace box), and concurrent syncs must never race a
      // findFirst()+create() into a unique-constraint failure.
      const existing = Boolean(existingRow);
      const thread = await prisma.mailThread.upsert({
        where: { mailAccountId_gmailThreadId: { mailAccountId: accountId, gmailThreadId: m.threadId } },
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
        select: { id: true },
      });
      await syncStateFromLabels(thread.id, m.labelIds);
      if (!existing) created++;
    }
    if (!list.nextPageToken) break;
    pageToken = list.nextPageToken;
  }
  return created;
}

export async function syncMailboxRecent(accountId: string, maxPerFolder = 250) {
  let total = 0;
  for (const folder of ["INBOX", "SENT", "DRAFTS", "IMPORTANT"] as const)
    total += await syncFolder(accountId, folder, maxPerFolder);
  return total;
}

type GmailAttachment = { filename: string; mimeType: string; data: Buffer | Uint8Array };
function safeHeaderValue(value: string) {
  return value.replace(/[\r\n]/g, " ");
}
/** RFC 2047 encoded-word for non-ASCII header values (Subject); ASCII passes through. */
function encodeHeaderWord(value: string) {
  const v = safeHeaderValue(value);
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}
function safeFilename(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 180) || "attachment";
}
function base64Lines(data: Buffer | Uint8Array) {
  return Buffer.from(data)
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
}
function base64Url(value: string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function gmailSend(
  accountId: string,
  input: {
    to: string;
    subject: string;
    text: string;
    fromEmail?: string;
    replyTo?: string;
    automated?: boolean;
    inReplyToGmailId?: string;
    attachments?: GmailAttachment[];
  },
): Promise<string> {
  const { token, email } = await accessTokenFor(accountId),
    attachments = input.attachments ?? [],
    fromEmail = input.fromEmail || (input.automated ? AUTOMATED_NO_REPLY_EMAIL : email),
    common = [
      `From: ${safeHeaderValue(fromEmail)}`,
      `To: ${safeHeaderValue(input.to)}`,
      ...(input.replyTo ? [`Reply-To: ${safeHeaderValue(input.replyTo)}`] : []),
      ...(input.automated ? ["Auto-Submitted: auto-generated", "X-Auto-Response-Suppress: All"] : []),
      `Subject: ${encodeHeaderWord(input.subject)}`,
      "MIME-Version: 1.0",
    ];
  let message: string;
  if (!attachments.length)
    message = `${[...common, 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit"].join("\r\n")}\r\n\r\n${input.text}`;
  else {
    const boundary = `jun_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      parts = [
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
  const res = await gmail<{ id: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  return res.id;
}
export async function markGmailRead(accountId: string, gmailThreadId: string): Promise<void> {
  const { token } = await accessTokenFor(accountId);
  await gmail(token, `/threads/${gmailThreadId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}
