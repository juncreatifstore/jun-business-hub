"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PUBLIC_EXPIRES_PREFIX, PUBLIC_PASSWORD_PREFIX } from "@/lib/drive-public-security";

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
  const file = await prisma.file.findFirst({ where: { id: fileId, isVault: false, archivedAt: null }, select: { id: true, name: true } });
  if (!file) redirect(withToast(returnTo, "toast_error", "File not found"));

  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  let expiresIso: string | null = null;
  if (expiresRaw) {
    const parsed = new Date(expiresRaw);
    if (Number.isNaN(parsed.getTime())) redirect(withToast(returnTo, "toast_error", "Invalid expiration date"));
    if (parsed.getTime() <= Date.now()) redirect(withToast(returnTo, "toast_error", "Expiration must be in the future"));
    expiresIso = parsed.toISOString();
  }

  const password = String(formData.get("password") ?? "");
  const clearPassword = String(formData.get("clearPassword") ?? "") === "1";
  if (password && password.length < 6) redirect(withToast(returnTo, "toast_error", "Public-link password must contain at least 6 characters"));

  const expiresKey = `${PUBLIC_EXPIRES_PREFIX}${file.id}`;
  const passwordKey = `${PUBLIC_PASSWORD_PREFIX}${file.id}`;
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
    after: { expiresAt: expiresIso, passwordChanged, passwordCleared: clearPassword },
  });
  revalidatePath("/app/drive");
  revalidatePath(`/view/file/${file.id}`);
  redirect(withToast(returnTo, "toast", "Public-link security updated"));
}
