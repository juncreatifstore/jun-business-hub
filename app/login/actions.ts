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

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`login:${ip}`, 10, 60_000))) {
    return { error: "Too many attempts. Wait a minute and try again." };
  }
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  // Constant-shaped response: never reveal whether the email exists.
  const ok = user && user.status === "ACTIVE" && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!ok || !user) return { error: "Email or password is incorrect." };

  // MFA: if enabled, issue a short-lived pending token instead of a session.
  if (user.mfaEnabled && user.mfaSecret) {
    const pending = await signSession({ sub: user.id, role: `MFA_PENDING` });
    cookies().set("jun_mfa_pending", pending, { ...sessionCookieOptions, maxAge: 300 });
    redirect(`/login/mfa`);
  }

  const token = await signSession({ sub: user.id, role: user.role });
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions);
  const ua = headers().get("user-agent") ?? null;
  await prisma.session.create({
    data: { userId: user.id, tokenHash: sha256(token), ip, userAgent: ua, expiresAt: new Date(Date.now() + 12 * 3600 * 1000) },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "LOGIN", resourceType: "User", resourceId: user.id });

  const next = String(formData.get("next") ?? "");
  redirect(user.role === "CLIENT" ? "/client" : next.startsWith("/app") ? next : "/app");
}

export async function logout() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } }).catch(() => undefined);
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
