"use server";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { listApprovedWhatsAppTemplates } from "@/lib/whatsapp";
import { OUTREACH_TEMPLATE_KEY } from "@/lib/whatsapp-outreach";

export async function saveWhatsAppOutreachTemplate(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const raw = String(formData.get("template") ?? "");
  if (!raw) {
    await prisma.appSetting.deleteMany({ where: { key: OUTREACH_TEMPLATE_KEY } });
    redirect(`/app/settings/whatsapp?toast=${encodeURIComponent("Modèle de lien retiré")}`);
  }
  const [name, language = "fr"] = raw.split("::");
  const approved = (await listApprovedWhatsAppTemplates().catch(() => [])).find(
    (t) => t.name === name && t.language === language,
  );
  if (!approved)
    redirect(
      `/app/settings/whatsapp?toast_error=${encodeURIComponent("Modèle introuvable ou non approuvé")}`,
    );
  const value = JSON.stringify({ name, language, params: approved.params });
  await prisma.appSetting.upsert({
    where: { key: OUTREACH_TEMPLATE_KEY },
    create: { key: OUTREACH_TEMPLATE_KEY, value },
    update: { value },
  });
  await audit({
    userId: user.id,
    action: "WHATSAPP_OUTREACH_TEMPLATE_SET",
    resourceType: "AppSetting",
    resourceId: OUTREACH_TEMPLATE_KEY,
    after: { name, language },
  });
  redirect(`/app/settings/whatsapp?toast=${encodeURIComponent(`Modèle de lien : ${name} (${language})`)}`);
}
