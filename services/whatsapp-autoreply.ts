"use server";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  getAutoReplySettings,
  saveAutoReplySettings,
  type AutoReplySettings,
} from "@/lib/whatsapp-autoreply";

export async function saveWhatsAppAutoReply(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const current = await getAutoReplySettings();
  const str = (k: string, fallback: string, max = 1500) =>
    String(formData.get(k) ?? fallback)
      .trim()
      .slice(0, max) || fallback;
  const hours: AutoReplySettings["hours"] = {};
  for (const d of ["0", "1", "2", "3", "4", "5", "6"]) {
    const open = String(formData.get(`open_${d}`) ?? "").trim();
    const close = String(formData.get(`close_${d}`) ?? "").trim();
    hours[d] =
      /^\d{2}:\d{2}$/.test(open) && /^\d{2}:\d{2}$/.test(close) && open < close ? { open, close } : null;
  }
  const next: AutoReplySettings = {
    enabled: formData.get("enabled") === "1",
    includeStatus: formData.get("includeStatus") === "1",
    timezone: str("timezone", current.timezone, 64),
    cooldownHours: Math.min(168, Math.max(1, Number(formData.get("cooldownHours")) || current.cooldownHours)),
    hours,
    outOfHours: {
      fr: str("outOfHours_fr", current.outOfHours.fr),
      en: str("outOfHours_en", current.outOfHours.en),
    },
    inHoursGreeting: {
      fr: str("inHours_fr", current.inHoursGreeting.fr),
      en: str("inHours_en", current.inHoursGreeting.en),
    },
    signature: str("signature", current.signature, 80),
  };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: next.timezone });
  } catch {
    redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent("Fuseau horaire invalide")}`);
  }
  await saveAutoReplySettings(next);
  await audit({
    userId: user.id,
    action: "WHATSAPP_AUTOREPLY_UPDATED",
    resourceType: "AppSetting",
    resourceId: "whatsapp.autoreply",
    after: { enabled: next.enabled, timezone: next.timezone },
  });
  redirect(`/app/settings/whatsapp?toast=${encodeURIComponent("Réponses automatiques enregistrées")}`);
}
