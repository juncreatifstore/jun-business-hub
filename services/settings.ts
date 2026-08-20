"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { storage, makeStorageKey } from "@/lib/storage";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const ALLOWED_KEYS = new Set([
  "company.name", "company.trade_name", "company.tagline", "company.email", "company.finance_email",
  "company.documents_email", "company.support_email", "company.phone", "company.phone_secondary", "company.whatsapp",
  "company.po_box", "company.address", "company.mailing_address", "company.website", "company.registration",
  "company.tax_id", "company.legal_representative", "company.representative_title", "company.registration_country",
  "company.registration_state", "company.formation_date", "company.bank_details",
  "brand.primary", "brand.secondary", "brand.accent",
  "document.watermark_opacity", "document.seal_size", "document.footer_label",
  "document.show_logo", "document.show_seal", "document.show_signature", "document.show_qr", "document.show_tax_id",
  "numbering.year_reset",
]);

const HSL_RE = /^\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%$/;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BRAND_ASSET = 5 * 1024 * 1024;

type AssetName = "logo" | "seal" | "signature";

async function currentSetting(key: string) {
  return prisma.appSetting.findUnique({ where: { key } });
}

async function handleAsset(formData: FormData, asset: AssetName) {
  const settingKey = `document.${asset}_key`;
  const uploadField = `document.${asset}`;
  const removeField = `document.${asset}_remove`;
  const existing = await currentSetting(settingKey);
  const fileValue = formData.get(uploadField);
  const shouldRemove = String(formData.get(removeField) ?? "") === "yes";

  let uploadedKey: string | null = null;
  if (fileValue instanceof File && fileValue.size > 0) {
    if (!IMAGE_TYPES.has(fileValue.type)) throw new Error(`${asset} must be PNG, JPEG or WEBP`);
    if (fileValue.size > MAX_BRAND_ASSET) throw new Error(`${asset} must be 5 MB or smaller`);
    const ext = fileValue.type === "image/png" ? "png" : fileValue.type === "image/webp" ? "webp" : "jpg";
    uploadedKey = makeStorageKey(`branding/${asset}`, `${asset}.${ext}`);
    await storage().upload(uploadedKey, Buffer.from(await fileValue.arrayBuffer()), fileValue.type);
    await prisma.appSetting.upsert({
      where: { key: settingKey },
      update: { value: uploadedKey },
      create: { key: settingKey, value: uploadedKey },
    });
    if (existing?.value && existing.value !== uploadedKey) await storage().remove(existing.value).catch(() => undefined);
    return { changed: true, action: "uploaded" as const };
  }

  if (shouldRemove && existing?.value) {
    await prisma.appSetting.deleteMany({ where: { key: settingKey } });
    await storage().remove(existing.value).catch(() => undefined);
    return { changed: true, action: "removed" as const };
  }
  return { changed: false, action: "unchanged" as const };
}

export async function saveSettings(formData: FormData): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");

  const updates: { key: string; value: string }[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const maxLength = key === "company.bank_details" ? 2000 : 500;
    const value = String(raw).trim().slice(0, maxLength);
    if (key.startsWith("brand.") && value && !HSL_RE.test(value)) {
      redirect(`/app/settings?toast_error=${encodeURIComponent(`${key} must be HSL like “222 47% 11%”`)}`);
    }
    if (key === "document.watermark_opacity" && value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0.02 || n > 0.12) redirect(`/app/settings?toast_error=${encodeURIComponent("Watermark opacity must be between 0.02 and 0.12")}`);
    }
    if (key === "document.seal_size" && value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 40 || n > 120) redirect(`/app/settings?toast_error=${encodeURIComponent("Seal size must be between 40 and 120")}`);
    }
    updates.push({ key, value });
  }

  for (const checkboxKey of ["document.show_logo", "document.show_seal", "document.show_signature", "document.show_qr", "document.show_tax_id"]) {
    if (!formData.has(checkboxKey)) updates.push({ key: checkboxKey, value: "off" });
  }

  try {
    for (const u of updates) {
      if (u.value === "") {
        await prisma.appSetting.deleteMany({ where: { key: u.key } });
      } else {
        await prisma.appSetting.upsert({ where: { key: u.key }, update: { value: u.value }, create: { key: u.key, value: u.value } });
      }
    }

    const [logo, seal, signature] = await Promise.all([
      handleAsset(formData, "logo"),
      handleAsset(formData, "seal"),
      handleAsset(formData, "signature"),
    ]);

    await audit({
      userId: user.id,
      action: "SETTINGS_UPDATE",
      resourceType: "AppSetting",
      after: {
        keys: updates.map((u) => u.key),
        logo: logo.action,
        seal: seal.action,
        signature: signature.action,
      },
    });
  } catch (error) {
    redirect(`/app/settings?toast_error=${encodeURIComponent(error instanceof Error ? error.message : "Settings could not be saved")}`);
  }

  revalidatePath("/", "layout");
  revalidatePath("/app/settings");
  redirect("/app/settings?toast=Settings saved");
}
