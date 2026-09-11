"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  EMAIL_ALIASES_SETTING_KEY,
  EMAIL_ALIAS_DOMAIN,
  EMAIL_ALIAS_DESTINATION,
  listEmailAliases,
  type EmailAlias,
} from "@/lib/email-aliases";
import {
  listGoogleDirectoryAliases,
  listGoogleSendAsAliases,
} from "@/lib/google/gmail-aliases";

function aliasesUrl(message: string, error = false) {
  const key = error ? "toast_error" : "toast";
  return `/app/settings/email/aliases?${key}=${encodeURIComponent(message)}`;
}

function normalizeLocalPart(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/@juncreatifs\.org$/, "");
}

async function writeAliases(aliases: EmailAlias[]) {
  await prisma.appSetting.upsert({
    where: { key: EMAIL_ALIASES_SETTING_KEY },
    create: { key: EMAIL_ALIASES_SETTING_KEY, value: JSON.stringify(aliases) },
    update: { value: JSON.stringify(aliases) },
  });
}

export async function addEmailAlias(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const localPart = normalizeLocalPart(formData.get("localPart"));
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart)) {
    redirect(aliasesUrl("Utilisez seulement des lettres, chiffres, points, tirets ou underscores.", true));
  }

  const address = `${localPart}@${EMAIL_ALIAS_DOMAIN}`;
  if (address === EMAIL_ALIAS_DESTINATION) {
    redirect(aliasesUrl("Cette adresse est déjà la boîte de destination.", true));
  }

  const aliases = await listEmailAliases();
  if (aliases.some((alias) => alias.address === address)) {
    redirect(aliasesUrl("Cet alias existe déjà dans l’application.", true));
  }

  const alias: EmailAlias = {
    address,
    destination: EMAIL_ALIAS_DESTINATION,
    confirmed: false,
    createdAt: new Date().toISOString(),
  };
  await writeAliases([...aliases, alias].sort((a, b) => a.address.localeCompare(b.address)));
  await audit({
    userId: user.id,
    action: "EMAIL_ALIAS_ADDED",
    resourceType: "AppSetting",
    resourceId: EMAIL_ALIASES_SETTING_KEY,
    after: alias,
  });
  revalidatePath("/app/settings/email/aliases");
  redirect(aliasesUrl(`${address} ajouté. Créez maintenant le même alias dans Google Workspace.`));
}

export async function setEmailAliasConfirmed(address: string, formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const confirmed = String(formData.get("confirmed")) === "true";
  const aliases = await listEmailAliases();
  const current = aliases.find((alias) => alias.address === address);
  if (!current) redirect(aliasesUrl("Alias introuvable.", true));

  await writeAliases(
    aliases.map((alias) => (alias.address === address ? { ...alias, confirmed } : alias)),
  );
  await audit({
    userId: user.id,
    action: confirmed ? "EMAIL_ALIAS_CONFIRMED" : "EMAIL_ALIAS_MARKED_PENDING",
    resourceType: "AppSetting",
    resourceId: EMAIL_ALIASES_SETTING_KEY,
    before: current,
    after: { ...current, confirmed },
  });
  revalidatePath("/app/settings/email/aliases");
  redirect(aliasesUrl(confirmed ? "Alias marqué comme actif." : "Alias marqué comme à configurer."));
}

export async function removeEmailAlias(address: string): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const aliases = await listEmailAliases();
  const current = aliases.find((alias) => alias.address === address);
  if (!current) redirect(aliasesUrl("Alias introuvable.", true));

  await writeAliases(aliases.filter((alias) => alias.address !== address));
  await audit({
    userId: user.id,
    action: "EMAIL_ALIAS_REMOVED",
    resourceType: "AppSetting",
    resourceId: EMAIL_ALIASES_SETTING_KEY,
    before: current,
  });
  revalidatePath("/app/settings/email/aliases");
  redirect(aliasesUrl(`${address} retiré de l’application. Supprimez-le aussi dans Google Workspace si nécessaire.`));
}


export async function syncEmailAliasesFromGoogle(): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const account = await prisma.mailAccount.findUnique({
    where: { email: EMAIL_ALIAS_DESTINATION },
    select: { id: true, email: true, accessTokenEnc: true, refreshTokenEnc: true },
  });
  if (!account || (!account.accessTokenEnc && !account.refreshTokenEnc)) {
    redirect(
      aliasesUrl(
        `Connectez d’abord ${EMAIL_ALIAS_DESTINATION} dans Paramètres → Intégration Email.`,
        true,
      ),
    );
  }

  let directoryAliases: string[];
  let sendAsAliases: Awaited<ReturnType<typeof listGoogleSendAsAliases>> = [];
  try {
    directoryAliases = await listGoogleDirectoryAliases(account.id, account.email);
    sendAsAliases = await listGoogleSendAsAliases(account.id).catch(() => []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation Google Admin impossible.";
    redirect(aliasesUrl(message, true));
  }

  const existing = await listEmailAliases();
  const existingByAddress = new Map(existing.map((alias) => [alias.address.toLowerCase(), alias]));
  const acceptedSenders = new Set(
    sendAsAliases
      .filter((entry) => entry.verificationStatus === "accepted" || entry.isPrimary)
      .map((entry) => entry.sendAsEmail.toLowerCase()),
  );
  const domainSuffix = `@${EMAIL_ALIAS_DOMAIN}`;
  const aliases: EmailAlias[] = [...new Set(directoryAliases)]
    .filter(
      (address) =>
        address.endsWith(domainSuffix) &&
        address !== EMAIL_ALIAS_DESTINATION,
    )
    .map((address) => ({
      address,
      destination: EMAIL_ALIAS_DESTINATION,
      // A Workspace user alias returned by Admin Directory is authoritative.
      // Gmail's accepted SendAs state is also retained when available.
      confirmed: true || acceptedSenders.has(address),
      createdAt: existingByAddress.get(address)?.createdAt || new Date().toISOString(),
    }))
    .sort((a, b) => a.address.localeCompare(b.address));

  await writeAliases(aliases);
  await audit({
    userId: user.id,
    action: "EMAIL_ALIASES_SYNCED_FROM_GOOGLE",
    resourceType: "AppSetting",
    resourceId: EMAIL_ALIASES_SETTING_KEY,
    before: { aliases: existing.map((alias) => alias.address) },
    after: {
      mailbox: account.email,
      aliases: aliases.map((alias) => ({ address: alias.address, confirmed: alias.confirmed })),
    },
  });
  revalidatePath("/app/settings/email/aliases");
  revalidatePath("/app/mail/aliases");
  revalidatePath("/app/mail/compose");
  redirect(
    aliasesUrl(
      aliases.length
        ? `${aliases.length} alias${aliases.length > 1 ? "s" : ""} synchronisé${aliases.length > 1 ? "s" : ""} depuis Google.`
        : "Aucun alias n’a été retourné par Google Admin Directory.",
    ),
  );
}
