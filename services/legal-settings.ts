"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";

const kinds = new Set(["privacy", "terms", "deletion"]);
const locales = new Set(["en", "fr", "es", "ht"]);

function target(formData: FormData) {
  const kind = String(formData.get("kind") ?? "");
  const locale = String(formData.get("locale") ?? "");
  if (!kinds.has(kind) || !locales.has(locale)) throw new Error("Invalid legal page or language");
  return { kind, locale, key: `legal.${kind}.${locale}` };
}

export async function saveLegalContent(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const { kind, locale, key } = target(formData);
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "reset") {
    await prisma.appSetting.deleteMany({ where: { key } });
    await audit({
      userId: user.id,
      action: "LEGAL_CONTENT_RESET",
      resourceType: "AppSetting",
      resourceId: key,
      after: { kind, locale },
    });
  } else {
    const title = String(formData.get("title") ?? "")
      .trim()
      .slice(0, 200);
    const intro = String(formData.get("intro") ?? "")
      .trim()
      .slice(0, 3000);
    const updated = String(formData.get("updated") ?? "")
      .trim()
      .slice(0, 120);
    const body = String(formData.get("body") ?? "")
      .trim()
      .slice(0, 50000);
    if (!title || !intro || !updated || !body) {
      redirect(
        `/app/settings/legal?kind=${kind}&lang=${locale}&toast_error=${encodeURIComponent("All fields are required")}`,
      );
    }
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: JSON.stringify({ title, intro, updated, body }) },
      create: { key, value: JSON.stringify({ title, intro, updated, body }) },
    });
    await audit({
      userId: user.id,
      action: "LEGAL_CONTENT_UPDATE",
      resourceType: "AppSetting",
      resourceId: key,
      after: { kind, locale, title, contentLength: body.length },
    });
  }

  revalidatePath("/privacy");
  revalidatePath("/terms");
  revalidatePath("/data-deletion");
  revalidatePath("/app/settings/legal");
  redirect(
    `/app/settings/legal?kind=${kind}&lang=${locale}&toast=${encodeURIComponent(intent === "reset" ? "Default content restored" : "Legal page published")}`,
  );
}
