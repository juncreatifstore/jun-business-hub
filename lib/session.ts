import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "jun_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
    return new TextEncoder().encode("jun-dev-secret-do-not-use-in-production");
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = { sub: string; role: string };

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub, role: String(payload.role ?? "VIEWER") };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
