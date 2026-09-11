"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isCloudAdmin } from "@/lib/drive-cloud";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PROFILES,
  REQUIREMENTS_KEY,
  saveRequirementProfiles,
  type RequirementProfile,
} from "@/lib/document-requirements";
import { DOC_TYPES, type DocType } from "@/lib/file-extraction";

const PAGE = "/app/drive/clients/requirements";

export async function saveRequirements(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const count = Math.min(30, Number(formData.get("count") ?? 0) || 0);
  const profiles: RequirementProfile[] = [];
  for (let i = 0; i < count; i++) {
    const key = String(formData.get(`p${i}.key`) ?? "").trim();
    if (!key) continue;
    const label = String(formData.get(`p${i}.label`) ?? key).trim() || key;
    const keywords = String(formData.get(`p${i}.keywords`) ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const required: DocType[] = [];
    const optional: DocType[] = [];
    for (const t of DOC_TYPES) {
      const v = String(formData.get(`p${i}.${t}`) ?? "");
      if (v === "required") required.push(t);
      else if (v === "optional") optional.push(t);
    }
    profiles.push({ key, label, keywords, required, optional });
  }
  if (!profiles.length) redirect(`${PAGE}?toast_error=${encodeURIComponent("Nothing to save")}`);
  await saveRequirementProfiles(profiles);
  await audit({
    userId: user.id,
    action: "DRIVE_REQUIREMENTS_UPDATED",
    resourceType: "AppSetting",
    resourceId: REQUIREMENTS_KEY,
    after: { profiles: profiles.length },
  });
  revalidatePath("/app/drive/clients");
  redirect(`${PAGE}?toast=${encodeURIComponent("Checklists saved")}`);
}

export async function resetRequirements(): Promise<void> {
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  await prisma.appSetting.deleteMany({ where: { key: REQUIREMENTS_KEY } });
  await audit({
    userId: user.id,
    action: "DRIVE_REQUIREMENTS_RESET",
    resourceType: "AppSetting",
    resourceId: REQUIREMENTS_KEY,
    after: { profiles: DEFAULT_PROFILES.length },
  });
  revalidatePath("/app/drive/clients");
  redirect(`${PAGE}?toast=${encodeURIComponent("Defaults restored")}`);
}
