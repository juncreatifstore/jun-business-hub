import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const ONLINE_SESSION_PREFIX = "finance.online.session.";
export const ONLINE_PROVIDER_INDEX_PREFIX = "finance.online.provider.";
export const ONLINE_WEBHOOK_PREFIX = "finance.online.webhook.";

export type OnlinePaymentProvider = "STRIPE" | "PAYPAL" | "MERCADO_PAGO";
export type OnlinePaymentStatus = "CREATED" | "PENDING" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";

export type OnlinePaymentSession = {
  id: string;
  paymentId: string;
  tokenHash: string;
  provider: OnlinePaymentProvider;
  status: OnlinePaymentStatus;
  amount: number;
  currency: string;
  description: string;
  clientName: string;
  clientEmail: string | null;
  checkoutUrl: string | null;
  providerSessionId: string | null;
  providerPaymentId: string | null;
  expiresAt: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

function hashToken(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function makeOnlinePublicToken(id: string) {
  const secret = randomBytes(24).toString("base64url");
  return { publicToken: `${id}.${secret}`, tokenHash: hashToken(secret) };
}

export function parseOnlinePublicToken(token: string) {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  return { id: token.slice(0, dot), secret: token.slice(dot + 1) };
}

function parseSession(value: string): OnlinePaymentSession | null {
  try {
    const row = JSON.parse(value) as OnlinePaymentSession;
    return row?.id && row?.paymentId && row?.provider ? row : null;
  } catch { return null; }
}

export async function getOnlinePaymentSession(id: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${ONLINE_SESSION_PREFIX}${id}` }, select: { value: true } });
  return row ? parseSession(row.value) : null;
}

export async function getOnlinePaymentSessionByToken(token: string) {
  const parsed = parseOnlinePublicToken(token);
  if (!parsed) return null;
  const session = await getOnlinePaymentSession(parsed.id);
  if (!session || !safeEqual(hashToken(parsed.secret), session.tokenHash)) return null;
  if (["CREATED", "PENDING"].includes(session.status) && new Date(session.expiresAt).getTime() <= Date.now()) {
    const expired = { ...session, status: "EXPIRED" as const, updatedAt: new Date().toISOString() };
    await saveOnlinePaymentSession(expired);
    return expired;
  }
  return session;
}

export async function listOnlinePaymentSessions(limit = 150) {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: ONLINE_SESSION_PREFIX } }, orderBy: { updatedAt: "desc" }, take: limit, select: { value: true } });
  return rows.map((r) => parseSession(r.value)).filter((v): v is OnlinePaymentSession => Boolean(v));
}

export async function saveOnlinePaymentSession(session: OnlinePaymentSession) {
  const key = `${ONLINE_SESSION_PREFIX}${session.id}`;
  const value = JSON.stringify(session);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  if (session.providerSessionId) {
    const indexKey = `${ONLINE_PROVIDER_INDEX_PREFIX}${session.provider}.${session.providerSessionId}`;
    await prisma.appSetting.upsert({ where: { key: indexKey }, create: { key: indexKey, value: session.id }, update: { value: session.id } });
  }
}

export async function getOnlineSessionByProviderId(provider: OnlinePaymentProvider, providerSessionId: string) {
  const row = await prisma.appSetting.findUnique({ where: { key: `${ONLINE_PROVIDER_INDEX_PREFIX}${provider}.${providerSessionId}` }, select: { value: true } });
  return row ? getOnlinePaymentSession(row.value) : null;
}

export async function markOnlineSessionStatus(id: string, status: OnlinePaymentStatus, options?: { providerPaymentId?: string | null; error?: string | null }) {
  const session = await getOnlinePaymentSession(id);
  if (!session) return null;
  if (session.status === "PAID" && status !== "PAID") return session;
  const next: OnlinePaymentSession = { ...session, status, providerPaymentId: options?.providerPaymentId ?? session.providerPaymentId, lastError: options?.error ?? null, updatedAt: new Date().toISOString() };
  await saveOnlinePaymentSession(next);
  if (status === "PAID") {
    const result = await prisma.payment.updateMany({ where: { id: session.paymentId, status: "PENDING" }, data: { status: "CONFIRMED", providerRef: options?.providerPaymentId || session.providerSessionId || undefined, paidAt: new Date() } });
    if (result.count > 0) {
      await prisma.notification.create({ data: { userId: session.createdById, type: "ONLINE_PAYMENT_CONFIRMED", title: "Online payment confirmed", body: `${session.provider.replaceAll("_", " ")} confirmed ${session.currency} ${session.amount.toFixed(2)} for ${session.clientName}.` } }).catch(() => undefined);
    }
  }
  return next;
}

export async function hasWebhookEvent(provider: OnlinePaymentProvider, eventId: string) {
  if (!eventId) return false;
  const row = await prisma.appSetting.findUnique({ where: { key: `${ONLINE_WEBHOOK_PREFIX}${provider}.${eventId}` }, select: { key: true } });
  return Boolean(row);
}

export async function registerWebhookEvent(provider: OnlinePaymentProvider, eventId: string) {
  if (!eventId) return;
  const key = `${ONLINE_WEBHOOK_PREFIX}${provider}.${eventId}`;
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: new Date().toISOString() }, update: {} });
}
