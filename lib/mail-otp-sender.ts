import "server-only";

import { prisma } from "@/lib/prisma";
import { EMAIL_ALIAS_DESTINATION } from "@/lib/email-aliases";

export const OTP_SENDER_SETTING_KEY = "mail.otp.sender.accountId";

export async function getOtpSenderAccountId(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: OTP_SENDER_SETTING_KEY },
    select: { value: true },
  });
  const value = row?.value?.trim();
  return value || null;
}

export async function resolveOtpSenderMailbox() {
  const automatedMailbox = await prisma.mailAccount.findUnique({
    where: { email: EMAIL_ALIAS_DESTINATION },
    select: {
      id: true,
      email: true,
      displayName: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
    },
  });
  if (automatedMailbox?.accessTokenEnc || automatedMailbox?.refreshTokenEnc) return automatedMailbox;

  const preferredId = await getOtpSenderAccountId();

  if (preferredId) {
    const preferred = await prisma.mailAccount.findUnique({
      where: { id: preferredId },
      select: {
        id: true,
        email: true,
        displayName: true,
        accessTokenEnc: true,
        refreshTokenEnc: true,
      },
    });

    if (!preferred) {
      throw new Error("OTP sender mailbox not found. Choose another OTP mailbox in Settings → Email.");
    }

    if (!preferred.accessTokenEnc && !preferred.refreshTokenEnc) {
      throw new Error(
        `OTP sender mailbox ${preferred.email} is disconnected. Reconnect it in Settings → Email.`,
      );
    }

    return preferred;
  }

  return prisma.mailAccount.findFirst({
    where: {
      OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      displayName: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
    },
  });
}
