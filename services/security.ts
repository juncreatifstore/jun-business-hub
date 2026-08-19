"use server";
import { prisma } from "@/lib/prisma";
import { requireUser, getCurrentUser, requestMeta } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { sha256 } from "@/lib/hash";
import { signSession, verifySession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { rateLimitAsync } from "@/lib/rate-limit";
import { generateSecret, verify as totpVerify } from "otplib";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function startMfaSetup(): Promise<void> {
  const user = await requireUser();
  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encryptSecret(secret), mfaEnabled: false } });
  revalidatePath("/app/settings/security");
  redirect("/app/settings/security?setup=1");
}

export async function confirmMfaSetup(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaSecret: true } });
  if (!row?.mfaSecret) redirect("/app/settings/security?toast_error=Start setup first");
  const secret = decryptSecret(row.mfaSecret);
  const check = await totpVerify({ token: code, secret, epochTolerance: 1 });
  if (!check.valid) redirect("/app/settings/security?setup=1&toast_error=Invalid code — check your authenticator app");
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await audit({ userId: user.id, action: "MFA_ENABLED", resourceType: "User", resourceId: user.id });
  redirect("/app/settings/security?toast=MFA enabled");
}

export async function disableMfa(formData: FormData): Promise<void> {
  const user = await requireUser();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { mfaSecret: true, mfaEnabled: true } });
  if (!row?.mfaEnabled || !row.mfaSecret) redirect("/app/settings/security?toast_error=MFA is not enabled");
  const check = await totpVerify({ token: code, secret: decryptSecret(row.mfaSecret), epochTolerance: 1 });
  if (!check.valid) redirect("/app/settings/security?toast_error=Invalid code");
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await audit({ userId: user.id, action: "MFA_DISABLED", resourceType: "User", resourceId: user.id });
  redirect("/app/settings/security?toast=MFA disabled");
}

export async function verifyMfaLogin(formData: FormData): Promise<void> {
  const { ip } = requestMeta();
  if (!(await rateLimitAsync(`mfa:${ip ?? "unknown"}`, 10, 60_000))) redirect("/login/mfa?toast_error=Too many attempts — wait a minute");
  const pending = cookies().get("jun_mfa_pending")?.value;
  const payload = pending ? await verifySession(pending) : null;
  if (!payload || payload.role !== "MFA_PENDING") redirect("/login?toast_error=MFA session expired — sign in again");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== "ACTIVE" || !user.mfaEnabled || !user.mfaSecret) redirect("/login");

  const code = String(formData.get("code") ?? "").replace(/[\s-]/g, "");
  const ok = (await totpVerify({ token: code, secret: decryptSecret(user.mfaSecret), epochTolerance: 1 }).catch(() => ({ valid: false }))).valid;
  if (!ok) redirect("/login/mfa?toast_error=Invalid code");

  const token = await signSession({ sub: user.id, role: user.role });
  cookies().set(SESSION_COOKIE, token, sessionCookieOptions);
  cookies().delete("jun_mfa_pending");
  const meta = requestMeta();
  await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), ip: meta.ip, userAgent: meta.userAgent, expiresAt: new Date(Date.now() + 12 * 3600 * 1000) } });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: "LOGIN_MFA", resourceType: "User", resourceId: user.id });
  redirect(user.role === "CLIENT" ? "/client" : "/app");
}

export async function revokeSession(sessionId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!s || s.userId !== user.id) redirect("/app/settings/security?toast_error=Session not found");
  await prisma.session.delete({ where: { id: s.id } });
  await audit({ userId: user.id, action: "SESSION_REVOKED", resourceType: "Session", resourceId: s.id });
  revalidatePath("/app/settings/security");
  redirect("/app/settings/security?toast=Session revoked");
}

export async function revokeOtherSessions(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const token = cookies().get(SESSION_COOKIE)?.value;
  const keep = token ? sha256(token) : "";
  await prisma.session.deleteMany({ where: { userId: user.id, tokenHash: { not: keep } } });
  await audit({ userId: user.id, action: "SESSIONS_REVOKED_ALL", resourceType: "User", resourceId: user.id });
  revalidatePath("/app/settings/security");
  redirect("/app/settings/security?toast=All other sessions revoked");
}
