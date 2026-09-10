import "server-only";
import { prisma } from "@/lib/prisma";
import { getMailConversation, type MailConversationMessage } from "@/lib/mail-thread-reader";
import { logger } from "@/lib/logger";

/**
 * Rendered-conversation cache.
 *
 * Reading a Gmail thread live costs 1–4 s (OAuth + threads.get format=full +
 * MIME walk). We keep the rendered messages in AppSetting keyed by thread and
 * stamp them with the thread's `lastMessageAt`: as long as the sync has not
 * seen a newer message, the cache is authoritative and the page renders from
 * one ~30 ms query. New messages bump `lastMessageAt`, which invalidates.
 */

const KEY = (threadId: string) => `mail.conversation.${threadId}`;
const MAX_HTML = 400_000; // per message; larger bodies are kept as text only

type Cached = {
  stamp: string;
  fetchedAt: string;
  messages: (Omit<MailConversationMessage, "date"> & { date: string })[];
};

function stampOf(lastMessageAt: Date | null) {
  return lastMessageAt ? lastMessageAt.toISOString() : "none";
}

export async function getCachedMailConversation(thread: {
  id: string;
  mailAccountId: string;
  gmailThreadId: string;
  lastMessageAt: Date | null;
}): Promise<{ messages: MailConversationMessage[]; source: "cache" | "gmail" }> {
  const stamp = stampOf(thread.lastMessageAt);
  const row = await prisma.appSetting.findUnique({ where: { key: KEY(thread.id) }, select: { value: true } });
  if (row) {
    try {
      const c = JSON.parse(row.value) as Cached;
      if (c.stamp === stamp) {
        return { messages: c.messages.map((m) => ({ ...m, date: new Date(m.date) })), source: "cache" };
      }
    } catch {}
  }
  const messages = await getMailConversation(thread.mailAccountId, thread.gmailThreadId);
  await storeConversation(thread.id, stamp, messages);
  return { messages, source: "gmail" };
}

async function storeConversation(threadId: string, stamp: string, messages: MailConversationMessage[]) {
  const slim: Cached = {
    stamp,
    fetchedAt: new Date().toISOString(),
    messages: messages.map((m) => ({
      ...m,
      date: m.date.toISOString(),
      htmlBody: m.htmlBody && m.htmlBody.length > MAX_HTML ? null : m.htmlBody,
    })),
  };
  const value = JSON.stringify(slim);
  try {
    await prisma.appSetting.upsert({
      where: { key: KEY(threadId) },
      create: { key: KEY(threadId), value },
      update: { value },
    });
  } catch (err) {
    logger.warn("mail.conversation_cache_write_failed", { threadId, err });
  }
}

/** Warm the cache for threads the team is likely to open next (called by the sync cron). */
export async function warmMailConversationCache(accountId: string, limit = 12) {
  const threads = await prisma.mailThread.findMany({
    where: { mailAccountId: accountId, aiDraft: null },
    orderBy: [{ lastMessageAt: "desc" }],
    take: limit,
    select: { id: true, mailAccountId: true, gmailThreadId: true, lastMessageAt: true },
  });
  const keys = threads.map((t) => KEY(t.id));
  const existing = await prisma.appSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  const fresh = new Set<string>();
  for (const r of existing) {
    try {
      const c = JSON.parse(r.value) as Cached;
      const t = threads.find((x) => KEY(x.id) === r.key);
      if (t && c.stamp === stampOf(t.lastMessageAt)) fresh.add(t.id);
    } catch {}
  }
  let warmed = 0;
  for (const t of threads) {
    if (fresh.has(t.id)) continue;
    try {
      const messages = await getMailConversation(t.mailAccountId, t.gmailThreadId);
      await storeConversation(t.id, stampOf(t.lastMessageAt), messages);
      warmed++;
    } catch (err) {
      logger.warn("mail.conversation_warm_failed", { threadId: t.id, err });
    }
  }
  return { considered: threads.length, warmed };
}
