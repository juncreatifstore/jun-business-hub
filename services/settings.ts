"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const ALLOWED_KEYS = new Set([
  "company.name", "company.email", "company.phone", "company.address", "company.website",
  "brand.primary", "brand.secondary", "brand.accent",
  "numbering.year_reset",
]);

const HSL_RE = /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/;

export async function saveSettings(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");

  const updates: { key: string; value: string }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const value = String(raw).trim().slice(0, 500);
    if (key.startsWith("brand.") && value && !HSL_RE.test(value)) {
      redirect(`/app/settings?toast_error=${encodeURIComponent(`${key} must be HSL like “222 47% 11%”`)}`);
    }
    updates.push({ key, value });
  }

  for (const u of updates) {
    if (u.value === "") {
      await prisma.appSetting.deleteMany({ where: { key: u.key } });
    } else {
      await prisma.appSetting.upsert({ where: { key: u.key }, update: { value: u.value }, create: { key: u.key, value: u.value } });
    }
  }

  await audit({ userId: user.id, action: "SETTINGS_UPDATE", resourceType: "AppSetting", after: { keys: updates.map((u) => u.key) } });
  revalidatePath("/", "layout");
  redirect("/app/settings?toast=Settings saved");
}
