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
  if (!automatedMailbox) {
    throw new Error(
      `Automated sender mailbox ${EMAIL_ALIAS_DESTINATION} is not connected. Connect it in Settings → Email.`,
    );
  }
  if (!automatedMailbox.accessTokenEnc && !automatedMailbox.refreshTokenEnc) {
    throw new Error(
      `Automated sender mailbox ${EMAIL_ALIAS_DESTINATION} is disconnected. Reconnect it in Settings → Email.`,
    );
  }
  return automatedMailbox;
}
