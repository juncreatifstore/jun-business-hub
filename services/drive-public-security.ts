"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PUBLIC_EXPIRES_PREFIX, PUBLIC_PASSWORD_PREFIX } from "@/lib/drive-public-security";
import { getDriveEnterpriseSettings } from "@/lib/drive-enterprise";

function safeReturn(formData: FormData) {
  const value = String(formData.get("returnTo") ?? "");
  return value.startsWith("/app/drive") ? value : "/app/drive";
}

function withToast(path: string, type: "toast" | "toast_error", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${type}=${encodeURIComponent(message)}`;
}

export async function saveDrivePublicSecurity(fileId: string, formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const returnTo = safeReturn(formData);
  const [file, enterprise] = await Promise.all([
    prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null }, select: { id: true, name: true } }),
    getDriveEnterpriseSettings(),
  ]);
  if (!file) redirect(withToast(returnTo, "toast_error", "File not found"));
  if (enterprise.publicLinkPolicy === "DISABLED") redirect(withToast(returnTo, "toast_error", "Public links are disabled by Enterprise policy"));

  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  let expiresIso: string | null = null;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) redirect(withToast(returnTo, "toast_error", "Invalid expiration date"));
    if (parsed.getTime() <= Date.now()) redirect(withToast(returnTo, "toast_error", "Expiration must be in the future"));
    if (enterprise.maxPublicLinkDays > 0 && parsed.getTime() > Date.now() + enterprise.maxPublicLinkDays * 86400000 + 60000) {
      redirect(withToast(returnTo, "toast_error", `Enterprise policy limits public links to ${enterprise.maxPublicLinkDays} days`));
    }
    expiresIso = parsed.toISOString();
  } else if (enterprise.maxPublicLinkDays > 0) {
    redirect(withToast(returnTo, "toast_error", `Enterprise policy requires an expiration within ${enterprise.maxPublicLinkDays} days`));
  }

  const password = String(formData.get("password") ?? "");
  const clearPassword = String(formData.get("clearPassword") ?? "") === "1";
  if (password && password.length < 6) redirect(withToast(returnTo, "toast_error", "Public-link password must contain at least 6 characters"));

  const expiresKey = `${PUBLIC_EXPIRES_PREFIX}${file.id}`;
  const passwordKey = `${PUBLIC_PASSWORD_PREFIX}${file.id}`;
  const existingPassword = await prisma.appSetting.findUnique({ where: { key: passwordKey }, select: { id: true } });
  if (enterprise.publicLinkPolicy === "PASSWORD_REQUIRED" && (clearPassword || (!password && !existingPassword))) {
    redirect(withToast(returnTo, "toast_error", "Enterprise policy requires password protection for public links"));
  }

  if (expiresIso) await prisma.appSetting.upsert({ where: { key: expiresKey }, update: { value: expiresIso }, create: { key: expiresKey, value: expiresIso } });
  else await prisma.appSetting.deleteMany({ where: { key: expiresKey } });

  let passwordChanged = false;
  if (clearPassword) {
    await prisma.appSetting.deleteMany({ where: { key: passwordKey } });
    passwordChanged = true;
  } else if (password) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.appSetting.upsert({ where: { key: passwordKey }, update: { value: passwordHash }, create: { key: passwordKey, value: passwordHash } });
    passwordChanged = true;
  }

  await audit({
    userId: user.id,
    action: "FILE_PUBLIC_SECURITY_UPDATE",
    resourceType: "File",
    resourceId: file.id,
    after: { expiresAt: expiresIso, passwordChanged, passwordCleared: clearPassword, enterprisePolicy: enterprise.publicLinkPolicy },
  });
  revalidatePath("/app/drive");
  revalidatePath(`/view/file/${file.id}`);
  redirect(withToast(returnTo, "toast", "Public-link security updated"));
}
