"use server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { sha256 } from "@/lib/hash";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";

export type ResetPasswordState = { success?: boolean; error?: string };
type ResetRow = { id: string; userId: string };

export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`password-reset:${ip}`, 10, 15 * 60_000))) return { error: "Too many attempts. Try again later." };
  if (!token || token.length < 20) return { error: "This reset link is invalid." };
  if (password.length < 10) return { error: "Password must be at least 10 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const tokenHash = sha256(token);
  const rows = await prisma.$queryRaw<ResetRow[]>`SELECT "id", "userId" FROM "PasswordResetToken" WHERE "tokenHash" = ${tokenHash} AND "usedAt" IS NULL AND "expiresAt" > NOW() LIMIT 1`;
  const reset = rows[0];
  if (!reset) return { error: "This reset link is invalid or has expired." };

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: reset.userId } }),
    prisma.$executeRaw`UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE "id" = ${reset.id} AND "usedAt" IS NULL`,
    prisma.$executeRaw`UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE "userId" = ${reset.userId} AND "usedAt" IS NULL`,
  ]);
  return { success: true };
}
