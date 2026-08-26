import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

export type WhatsAppPhoneWabaMatch = {
  configured: boolean;
  ok: boolean;
  match: boolean;
  phoneNumberId?: string;
  wabaId?: string;
  displayPhone?: string;
  verifiedName?: string;
  error?: string;
};

async function credentials() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["whatsapp.business_account_id", "whatsapp.phone_number_id", "whatsapp.access_token_enc", "whatsapp.graph_version"] } },
    select: { key: true, value: true },
  });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const wabaId = String(s["whatsapp.business_account_id"] || "").trim();
  const phoneNumberId = String(s["whatsapp.phone_number_id"] || "").trim();
  const enc = String(s["whatsapp.access_token_enc"] || "").trim();
  const graphVersion = String(s["whatsapp.graph_version"] || "v23.0").trim() || "v23.0";
  if (!wabaId || !phoneNumberId || !enc) return null;
  return { wabaId, phoneNumberId, token: decryptSecret(enc), graphVersion };
}

export async function getWhatsAppPhoneWabaMatch(): Promise<WhatsAppPhoneWabaMatch> {
  const c = await credentials();
  if (!c) return { configured: false, ok: false, match: false, error: "WABA ID, Phone Number ID or Permanent Access Token is missing." };
  try {
    const url = new URL(`https://graph.facebook.com/${c.graphVersion}/${encodeURIComponent(c.wabaId)}/phone_numbers`);
    url.searchParams.set("fields", "id,display_phone_number,verified_name");
    url.searchParams.set("limit", "100");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { configured: true, ok: false, match: false, phoneNumberId: c.phoneNumberId, wabaId: c.wabaId, error: `Meta ${response.status}: ${JSON.stringify(payload)}` };
    }
    const data = Array.isArray((payload as { data?: unknown[] }).data)
      ? (payload as { data: Array<{ id?: string; display_phone_number?: string; verified_name?: string }> }).data
      : [];
    const found = data.find((p) => String(p.id || "") === c.phoneNumberId);
    return {
      configured: true,
      ok: true,
      match: Boolean(found),
      phoneNumberId: c.phoneNumberId,
      wabaId: c.wabaId,
      displayPhone: found?.display_phone_number,
      verifiedName: found?.verified_name,
      ...(!found ? { error: "The saved Phone Number ID was not found among the phone numbers attached to the saved WABA." } : {}),
    };
  } catch (error) {
    return { configured: true, ok: false, match: false, phoneNumberId: c.phoneNumberId, wabaId: c.wabaId, error: error instanceof Error ? error.message : "Unable to verify Phone Number ID against WABA." };
  }
}
