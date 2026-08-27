import "server-only";

import { prisma } from "@/lib/prisma";

const PREFIX = "client.communication.ban.";

export type ClientCommunicationBan = {
  banned: boolean;
  reason?: string;
  bannedAt?: string;
  bannedById?: string;
};

function key(clientId: string) {
  return `${PREFIX}${clientId}`;
}

export async function getClientCommunicationBan(clientId: string): Promise<ClientCommunicationBan> {
  const row = await prisma.appSetting.findUnique({ where: { key: key(clientId) }, select: { value: true } });
  if (!row?.value) return { banned: false };
  try {
    const parsed = JSON.parse(row.value) as ClientCommunicationBan;
    return { banned: Boolean(parsed.banned), reason: parsed.reason, bannedAt: parsed.bannedAt, bannedById: parsed.bannedById };
  } catch {
    return { banned: row.value === "BANNED" || row.value === "true" };
  }
}

export async function isClientCommunicationBanned(clientId?: string | null) {
  if (!clientId) return false;
  return (await getClientCommunicationBan(clientId)).banned;
}

export async function setClientCommunicationBan(input: { clientId: string; banned: boolean; reason?: string; userId?: string }) {
  const value: ClientCommunicationBan = input.banned
    ? { banned: true, reason: String(input.reason || "").trim() || "Communication bloquée par JUN", bannedAt: new Date().toISOString(), bannedById: input.userId }
    : { banned: false };
  await prisma.appSetting.upsert({
    where: { key: key(input.clientId) },
    create: { key: key(input.clientId), value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
  return value;
}

export async function findBannedClientByPhone(phone: string) {
  const normalized = String(phone || "").replace(/[^0-9]/g, "");
  if (!normalized) return null;
  const clients = await prisma.client.findMany({
    where: { archivedAt: null, OR: [{ whatsapp: { not: null } }, { phone: { not: null } }] },
    select: { id: true, firstName: true, lastName: true, whatsapp: true, phone: true },
  });
  for (const client of clients) {
    const wa = String(client.whatsapp || "").replace(/[^0-9]/g, "");
    const tel = String(client.phone || "").replace(/[^0-9]/g, "");
    if (normalized === wa || normalized === tel) {
      if (await isClientCommunicationBanned(client.id)) return client;
    }
  }
  return null;
}

export async function findBannedClientByEmail(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const client = await prisma.client.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } }, select: { id: true, firstName: true, lastName: true, email: true } });
  if (!client) return null;
  return (await isClientCommunicationBanned(client.id)) ? client : null;
}
