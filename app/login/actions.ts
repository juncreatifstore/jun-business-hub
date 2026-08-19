"use server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { rateLimitAsync } from "@/lib/rate-limit";
import { sha256 } from "@/lib/hash";
import { audit } from "@/lib/audit";

export type LoginState = { error?: string };

function safeRuntimeCode(error: unknown): string {
  const e = error as { name?: string; code?: string; message?: string };
  const msg = String(e?.message ?? "");
  if (/DATABASE_URL is not set/i.test(msg)) return "DB_URL_MISSING";
  if (/password authentication failed|authentication failed/i.test(msg)) return "DB_AUTH";
  if (/ENOTFOUND|getaddrinfo|dns/i.test(msg)) return "DB_DNS";
  if (/ECONNREFUSED|connection refused/i.test(msg)) return "DB_REFUSED";
  if (/timeout|timed out/i.test(msg)) return "DB_TIMEOUT";
  if (/prepared statement|pgbouncer/i.test(msg)) return "DB_POOLER";
  if (/AUTH_SECRET is required/i.test(msg)) return "AUTH_SECRET_MISSING";
  if (/Prisma/i.test(msg) || /Prisma/i.test(String(e?.name ?? ""))) return `PRISMA${e?.code ? `_${e.code}` : ""}`;
  return `SERVER${e?.code ? `_${e.code}` : ""}`;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`login:${ip}`, 10, 60_000))) {
    return { error: "Too many attempts. Wait a minute and try again." };
  }

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password." };

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  } catch (error) {
    const code = safeRuntimeCode(error);
    console.error("LOGIN_DIAGNOSTIC:user_lookup", code, error);
    return { error: `Login service unavailable (${code}).` };
  }

  const ok = user && user.status === "ACTIVE" && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok || !user) return { error: "Email or password is incorrect." };

  if (user.mfaEnabled && user.mfaSecret) {
    try {
      const pending = await signSession({ sub: user.id, role: "MFA_PENDING" });
      cookies().set("jun_mfa_pending", pending, { ...sessionCookieOptions, maxAge: 300 });
    } catch (error) {
      const code = safeRuntimeCode(error);
      console.error("LOGIN_DIAGNOSTIC:mfa_session", code, error);
      return { error: `Login service unavailable (${code}).` };
    }
    redirect("/login/mfa");
  }

  let token: string;
  try {
    token = await signSession({ sub: user.id, role: user.role });
    cookies().set(SESSION_COOKIE, token, sessionCookieOptions);
  } catch (error) {
    const code = safeRuntimeCode(error);
    console.error("LOGIN_DIAGNOSTIC:session_sign", code, error);
    return { error: `Login service unavailable (${code}).` };
  }

  const ua = headers().get("user-agent") ?? null;
  try {
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        ip,
        userAgent: ua,
        expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
      },
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit({ userId: user.id, action: "LOGIN", resourceType: "User", resourceId: user.id });
  } catch (error) {
    cookies().delete(SESSION_COOKIE);
    const code = safeRuntimeCode(error);
    console.error("LOGIN_DIAGNOSTIC:session_persist", code, error);
    return { error: `Login service unavailable (${code}).` };
  }

  const next = String(formData.get("next") ?? "");
  redirect(user.role === "CLIENT" ? "/client" : next.startsWith("/app") ? next : "/app");
}

export async function logout() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => undefined);
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
