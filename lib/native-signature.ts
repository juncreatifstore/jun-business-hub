import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { signatureRecipients } from "@/lib/signature-recipients";

const ISSUER = "jun-business-hub";
const AUDIENCE = "jun-native-signature";
const DEFAULT_DAYS = 14;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
    return new TextEncoder().encode("jun-dev-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(value);
}

export type NativeSigningPayload = {
  requestId: string;
  email: string;
  order: number;
  verified?: boolean;
  linkVersion?: number;
};

export function nativeSigningExpiry(from = new Date()) {
  return new Date(from.getTime() + DEFAULT_DAYS * 24 * 60 * 60 * 1000);
}

export async function createNativeSigningToken(payload: NativeSigningPayload, expiresAt?: Date) {
  const expiry = expiresAt ?? nativeSigningExpiry();
  const linkVersion = Number.isInteger(payload.linkVersion) && Number(payload.linkVersion) > 0 ? Number(payload.linkVersion) : 1;
  return new SignJWT({ email: payload.email, order: payload.order, linkVersion, ...(payload.verified ? { verified: true } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.requestId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiry.getTime() / 1000))
    .sign(secret());
}

export async function verifyNativeSigningToken(token: string): Promise<NativeSigningPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    const order = Number(payload.order);
    if (!Number.isInteger(order) || order < 1) return null;
    const rawVersion = Number(payload.linkVersion ?? 1);
    const linkVersion = Number.isInteger(rawVersion) && rawVersion > 0 ? rawVersion : 1;
    return { requestId: payload.sub, email: payload.email, order, verified: payload.verified === true, linkVersion };
  } catch {
    return null;
  }
}

export function nativeTokenMatchesRecipient(payload: NativeSigningPayload, recipient: { email: string; order: number; linkVersion?: number | null }) {
  return payload.email.toLowerCase() === recipient.email.toLowerCase()
    && payload.order === recipient.order
    && (payload.linkVersion ?? 1) === (recipient.linkVersion ?? 1);
}

export async function createVerifiedNativeSigningToken(payload: Omit<NativeSigningPayload, "verified">, expiresAt?: Date) {
  return createNativeSigningToken({ ...payload, verified: true }, expiresAt);
}

async function currentLinkVersion(requestId: string, email: string, order: number) {
  const request = await prisma.signatureRequest.findUnique({ where: { id: requestId }, select: { recipients: true } }).catch(() => null);
  const recipient = request ? signatureRecipients(request.recipients).find((r) => r.email.toLowerCase() === email.toLowerCase() && r.order === order) : null;
  return recipient?.linkVersion ?? 1;
}

export async function nativeSigningUrl(requestId: string, email: string, order: number, expiresAt?: Date, linkVersion?: number) {
  const version = linkVersion ?? await currentLinkVersion(requestId, email, order);
  const token = await createNativeSigningToken({ requestId, email, order, linkVersion: version }, expiresAt);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org").replace(/\/$/, "");
  return `${base}/sign/${encodeURIComponent(token)}`;
}
