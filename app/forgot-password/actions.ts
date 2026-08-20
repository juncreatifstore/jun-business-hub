"use server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { sha256 } from "@/lib/hash";
import { gmailSend } from "@/lib/google/gmail";
import { headers } from "next/headers";
import { randomBytes, randomUUID } from "crypto";

export type ForgotPasswordState = { message?: string; error?: string };

export async function requestPasswordReset(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const generic = "If an active JUN account exists for that email, a reset link will be sent.";
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (!(await rateLimitAsync(`forgot:${ip}:${email}`, 5, 15 * 60_000))) return { message: generic };

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, firstName: true } });
  if (!user || user.status !== "ACTIVE") return { message: generic };

  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await prisma.$transaction([
    prisma.$executeRaw`DELETE FROM "PasswordResetToken" WHERE "userId" = ${user.id} AND "usedAt" IS NULL`,
    prisma.$executeRaw`INSERT INTO "PasswordResetToken" ("id","userId","tokenHash","expiresAt") VALUES (${randomUUID()}, ${user.id}, ${tokenHash}, ${expiresAt})`,
  ]);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!base) {
    console.error("PASSWORD_RESET_EMAIL_SKIPPED: NEXT_PUBLIC_APP_URL missing");
    return { message: generic };
  }
  const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
  const mailbox = await prisma.mailAccount.findFirst({ where: { refreshTokenEnc: { not: null } }, orderBy: { createdAt: "asc" } });
  if (!mailbox) {
    console.error("PASSWORD_RESET_EMAIL_SKIPPED: no connected JUN mailbox", { userId: user.id });
    return { message: generic };
  }

  try {
    await gmailSend(mailbox.id, {
      to: email,
      subject: "Reset your JUN Business Hub password",
      text: `Hello ${user.firstName},\n\nA password reset was requested for your JUN Business Hub account.\n\nOpen this secure link within 30 minutes:\n${resetUrl}\n\nIf you did not request this, ignore this email. The link can only be used once.\n\nJUN Business Hub`,
    });
  } catch (error) {
    console.error("PASSWORD_RESET_EMAIL_FAILED", error);
  }
  return { message: generic };
}
