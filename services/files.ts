"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { storage, makeStorageKey, MAX_UPLOAD_BYTES, ALLOWED_MIME } from "@/lib/storage";
import { emptyToNull } from "@/lib/validation";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FileCategory } from "@prisma/client";
import { VAULT_CATEGORIES } from "@/lib/utils";

const CATEGORIES = new Set(["IDENTITY", "PASSPORT", "CONTRACT", "PAYMENT_PROOF", "RECEIPT", "REFUND", "VISA", "FLIGHT", "INVOICE", "COMPANY", "LEGAL", "TAX", "EMPLOYEE", "VENDOR", "OTHER"]);

function driveDest(folderId?: string | null) {
  return folderId ? `/app/drive?folder=${encodeURIComponent(folderId)}` : "/app/drive";
}

export async function createFolder(formData: FormData): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  const parentId = emptyToNull(String(formData.get("parentId") ?? ""));
  if (!name) redirect(`${driveDest(parentId)}&toast_error=Folder name is required`.replace("?&", "?"));

  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, isVault: false }, select: { id: true } });
    if (!parent) redirect("/app/drive?toast_error=Parent folder not found");
  }

  const existing = await prisma.folder.findFirst({ where: { name, parentId, isVault: false }, select: { id: true } });
  if (existing) redirect(`${driveDest(parentId)}${parentId ? "&" : "?"}toast_error=A folder with this name already exists`);

  const folder = await prisma.folder.create({ data: { name, parentId, isVault: false } });
  await audit({ userId: user.id, action: "FOLDER_CREATE", resourceType: "Folder", resourceId: folder.id, after: { name, parentId } });
  revalidatePath("/app/drive");
  redirect(`${driveDest(parentId)}${parentId ? "&" : "?"}toast=Folder created`);
}

export async function uploadFile(formData: FormData): Promise<void> {
  const isVault = String(formData.get("isVault") ?? "") === "1";
  const user = await assertPermission(isVault ? "VAULT_MANAGE" : "FILE_UPLOAD");

  const raw = formData.get("file");
  if (!(raw instanceof File) || raw.size === 0) {
    redirect(`${isVault ? "/app/vault" : "/app/drive"}?toast_error=Please choose a file`);
  }
  if (raw.size > MAX_UPLOAD_BYTES) {
    redirect(`${isVault ? "/app/vault" : "/app/drive"}?toast_error=File exceeds the 15 MB limit`);
  }
  const mime = raw.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime)) {
    redirect(`${isVault ? "/app/vault" : "/app/drive"}?toast_error=File type not allowed (${mime})`);
  }

  const categoryRaw = String(formData.get("category") ?? "OTHER");
  const category = (CATEGORIES.has(categoryRaw) ? categoryRaw : "OTHER") as FileCategory;
  const vaultCategoryRaw = String(formData.get("vaultCategory") ?? "");
  const vaultCategory = isVault && (VAULT_CATEGORIES as readonly string[]).includes(vaultCategoryRaw) ? vaultCategoryRaw : null;
  const clientId = emptyToNull(String(formData.get("clientId") ?? ""));
  const caseId = emptyToNull(String(formData.get("caseId") ?? ""));
  const folderId = isVault ? null : emptyToNull(String(formData.get("folderId") ?? ""));

  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) {
    redirect("/app/drive?toast_error=Linked client not found");
  }
  if (caseId && !(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) {
    redirect("/app/drive?toast_error=Linked case not found");
  }
  if (folderId && !(await prisma.folder.findFirst({ where: { id: folderId, isVault: false }, select: { id: true } }))) {
    redirect("/app/drive?toast_error=Folder not found");
  }

  const key = makeStorageKey(isVault ? "vault" : "drive", raw.name);
  const buf = Buffer.from(await raw.arrayBuffer());
  await storage().upload(key, buf, mime);

  const record = await prisma.file.create({
    data: {
      name: raw.name.slice(0, 200),
      storageKey: key,
      mimeType: mime,
      sizeBytes: raw.size,
      category,
      folderId,
      isVault,
      vaultCategory,
      clientId,
      caseId,
      uploadedById: user.id,
    },
  });

  await audit({ userId: user.id, action: isVault ? "VAULT_UPLOAD" : "FILE_UPLOAD", resourceType: "File", resourceId: record.id, after: { name: record.name, sizeBytes: raw.size, category, isVault, folderId } });
  await logActivity({ userId: user.id, type: "FILE_UPLOADED", message: `Uploaded ${record.name}`, clientId: clientId ?? undefined, caseId: caseId ?? undefined });

  const dest = isVault ? "/app/vault" : driveDest(folderId);
  revalidatePath(isVault ? "/app/vault" : "/app/drive");
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}toast=File uploaded`);
}

export async function deleteFile(fileId: string): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) redirect("/app/drive?toast_error=File not found");
  const user = await assertPermission(file.isVault ? "VAULT_MANAGE" : "FILE_DELETE");

  await storage().remove(file.storageKey);
  await prisma.file.delete({ where: { id: file.id } });
  await audit({ userId: user.id, action: "FILE_DELETE", resourceType: "File", resourceId: file.id, before: { name: file.name, isVault: file.isVault, folderId: file.folderId } });

  const dest = file.isVault ? "/app/vault" : driveDest(file.folderId);
  revalidatePath(file.isVault ? "/app/vault" : "/app/drive");
  redirect(`${dest}${dest.includes("?") ? "&" : "?"}toast=File deleted`);
}
