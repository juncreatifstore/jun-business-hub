"use server";
import { rateLimitAsync } from "@/lib/rate-limit";
import { sha256 } from "@/lib/hash";
import { headers } from "next/headers";
import { randomBytes, randomUUID } from "crypto";

export type ForgotPasswordState = { message?: string; error?: string };

function safeResetCode(error: unknown): string {
  const e = error as { name?: string; code?: string; message?: string; path?: string };
  const msg = String(e?.message ?? "");
  if (/No valid PostgreSQL connection string/i.test(msg)) return "DB_URL";
  if (/password authentication failed|authentication failed/i.test(msg)) return "DB_AUTH";
  if (/ENOTFOUND|getaddrinfo|dns/i.test(msg)) return "DB_DNS";
  if (/ECONNREFUSED|connection refused/i.test(msg)) return "DB_REFUSED";
  if (/timeout|timed out/i.test(msg)) return "DB_TIMEOUT";
  if (/prepared statement|pgbouncer/i.test(msg)) return "DB_POOLER";
  if (e?.code === "ENOENT" || /ENOENT/i.test(msg)) {
    const rawPath = String(e?.path ?? msg.match(/(?:open|stat|access) ['\"]([^'\"]+)['\"]/i)?.[1] ?? "");
    const artifact = rawPath.split(/[\\/]/).filter(Boolean).pop()?.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
    return artifact ? `PRISMA_ENOENT_${artifact}` : "PRISMA_ENOENT";
  }
  if (/Cannot find module/i.test(msg)) {
    const mod = msg.match(/Cannot find module ['\"]([^'\"]+)['\"]/i)?.[1]?.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._@-]/g, "").slice(0, 80);
    return mod ? `MODULE_${mod}` : "MODULE_MISSING";
  }
  if (/Prisma/i.test(msg) || /Prisma/i.test(String(e?.name ?? ""))) return `PRISMA${e?.code ? `_${e.code}` : ""}`;
  return `SERVER${e?.code ? `_${e.code}` : ""}`;
}

export async function requestPasswordReset(_prev: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const generic = "If an active JUN account exists for that email, a reset link will be sent.";
  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (!(await rateLimitAsync(`forgot:${ip}:${email}`, 5, 15 * 60_000))) return { message: generic };

  try {
    const [{ prisma }, { gmailSend }] = await Promise.all([
      import("@/lib/prisma"),
      import("@/lib/google/gmail"),
    ]);

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
  } catch (error) {
    const code = safeResetCode(error);
    console.error("PASSWORD_RESET_DIAGNOSTIC", code, error);
    return { error: `Password reset service unavailable (${code}).` };
  }
}
