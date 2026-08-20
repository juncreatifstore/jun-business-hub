import "server-only";
import { SignJWT, jwtVerify } from "jose";

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
};

export function nativeSigningExpiry(from = new Date()) {
  return new Date(from.getTime() + DEFAULT_DAYS * 24 * 60 * 60 * 1000);
}

export async function createNativeSigningToken(payload: NativeSigningPayload, expiresAt?: Date) {
  const expiry = expiresAt ?? nativeSigningExpiry();
  return new SignJWT({ email: payload.email, order: payload.order })
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
    return { requestId: payload.sub, email: payload.email, order };
  } catch {
    return null;
  }
}

export async function nativeSigningUrl(requestId: string, email: string, order: number, expiresAt?: Date) {
  const token = await createNativeSigningToken({ requestId, email, order }, expiresAt);
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org").replace(/\/$/, "");
  return `${base}/sign/${encodeURIComponent(token)}`;
}
