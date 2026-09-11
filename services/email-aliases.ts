"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
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

async function readAliases(): Promise<EmailAlias[]> {
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

  const aliases = await readAliases();
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
  const aliases = await readAliases();
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
  const aliases = await readAliases();
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
