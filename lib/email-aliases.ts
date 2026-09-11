import "server-only";

import { prisma } from "@/lib/prisma";

export const EMAIL_ALIASES_SETTING_KEY = "email.aliases.juncreatifs.org";
export const EMAIL_ALIAS_DOMAIN = "juncreatifs.org";
export const EMAIL_ALIAS_DESTINATION = "admin@juncreatifs.org";

export type EmailAlias = {
  address: string;
  destination: string;
  confirmed: boolean;
  createdAt: string;
};

export async function listEmailAliases(): Promise<EmailAlias[]> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: EMAIL_ALIASES_SETTING_KEY },
    select: { value: true },
  });
  if (!setting) return [];
  try {
    const parsed = JSON.parse(setting.value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is EmailAlias =>
            typeof item?.address === "string" &&
            item.address.endsWith(`@${EMAIL_ALIAS_DOMAIN}`) &&
            item.destination === EMAIL_ALIAS_DESTINATION,
        )
      : [];
  } catch {
    return [];
  }
}

export async function isAllowedSenderAddress(mailboxEmail: string, fromEmail?: string | null) {
  const mailbox = mailboxEmail.trim().toLowerCase();
  const sender = (fromEmail || mailbox).trim().toLowerCase();
  if (sender === mailbox) return true;
  const aliases = await listEmailAliases();
  return aliases.some(
    (alias) =>
      alias.confirmed &&
      alias.address.toLowerCase() === sender &&
      alias.destination.toLowerCase() === mailbox,
  );
}
