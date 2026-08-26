import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export type WhatsAppWabaSubscriptionStatus = {
  configured: boolean;
  ok: boolean;
  expectedAppId: string;
  appMatch: boolean | null;
  matchedApp?: { id?: string; name?: string };
  subscribedApps: Array<{ id?: string; name?: string }>;
  error?: string;
};

type RawSubscribedApp = {
  id?: string | number;
  name?: string;
  whatsapp_business_api_data?: {
    id?: string | number;
    name?: string;
    link?: string;
  };
};

function normalizeSubscribedApp(app: RawSubscribedApp): { id?: string; name?: string } {
  const nested = app?.whatsapp_business_api_data;
  const id = String(nested?.id ?? app?.id ?? "").trim();
  const name = String(nested?.name ?? app?.name ?? "").trim();
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
  };
}

async function credentials() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["whatsapp.app_id", "whatsapp.business_account_id", "whatsapp.access_token_enc", "whatsapp.graph_version"] } },
    select: { key: true, value: true },
  });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const appId = String(s["whatsapp.app_id"] || "").trim();
  const wabaId = String(s["whatsapp.business_account_id"] || "").trim();
  const enc = String(s["whatsapp.access_token_enc"] || "").trim();
  const graphVersion = String(s["whatsapp.graph_version"] || "v23.0").trim() || "v23.0";
  if (!wabaId || !enc) return null;
  return { appId, wabaId, token: decryptSecret(enc), graphVersion };
}

export async function getWhatsAppWabaSubscriptionStatus(): Promise<WhatsAppWabaSubscriptionStatus> {
  const c = await credentials();
  if (!c) return { configured: false, ok: false, expectedAppId: "", appMatch: null, subscribedApps: [], error: "WABA ID or Permanent Access Token is missing." };
  try {
    const response = await fetch(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.wabaId)}/subscribed_apps`, {
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { configured: true, ok: false, expectedAppId: c.appId, appMatch: null, subscribedApps: [], error: `Meta ${response.status}: ${JSON.stringify(payload)}` };
    }

    const rawData = Array.isArray((payload as { data?: unknown[] }).data)
      ? (payload as { data: RawSubscribedApp[] }).data
      : [];
    const data = rawData.map(normalizeSubscribedApp);
    const appsWithId = data.filter((app) => Boolean(app.id));
    const matchedApp = c.appId ? appsWithId.find((app) => app.id === c.appId) : undefined;

    // Do not report a false mismatch when Meta omits application IDs from the response.
    // A mismatch is conclusive only when at least one subscribed App ID is actually returned.
    const appMatch = !c.appId
      ? null
      : matchedApp
        ? true
        : appsWithId.length > 0
          ? false
          : null;

    return {
      configured: true,
      ok: true,
      expectedAppId: c.appId,
      appMatch,
      matchedApp,
      subscribedApps: data,
    };
  } catch (error) {
    return { configured: true, ok: false, expectedAppId: c.appId, appMatch: null, subscribedApps: [], error: error instanceof Error ? error.message : "Unable to query Meta WABA subscription." };
  }
}

export async function subscribeCurrentMetaAppToWaba() {
  const c = await credentials();
  if (!c) throw new Error("Configure WhatsApp Business Account ID and Permanent Access Token first.");
  const response = await fetch(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meta WABA subscription ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}
