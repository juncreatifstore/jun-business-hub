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

  // Referential integrity: linked records must exist.
  if (clientId && !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) {
    redirect("/app/drive?toast_error=Linked client not found");
  }
  if (caseId && !(await prisma.case.findUnique({ where: { id: caseId }, select: { id: true } }))) {
    redirect("/app/drive?toast_error=Linked case not found");
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
      isVault,
      vaultCategory,
      clientId,
      caseId,
      uploadedById: user.id,
    },
  });

  await audit({ userId: user.id, action: isVault ? "VAULT_UPLOAD" : "FILE_UPLOAD", resourceType: "File", resourceId: record.id, after: { name: record.name, sizeBytes: raw.size, category, isVault } });
  await logActivity({ userId: user.id, type: "FILE_UPLOADED", message: `Uploaded ${record.name}`, clientId: clientId ?? undefined, caseId: caseId ?? undefined });

  const dest = isVault ? "/app/vault" : "/app/drive";
  revalidatePath(dest);
  redirect(`${dest}?toast=File uploaded`);
}

export async function deleteFile(fileId: string): Promise<void> {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) redirect("/app/drive?toast_error=File not found");
  const user = await assertPermission(file.isVault ? "VAULT_MANAGE" : "FILE_DELETE");

  await storage().remove(file.storageKey);
  await prisma.file.delete({ where: { id: file.id } });
  await audit({ userId: user.id, action: "FILE_DELETE", resourceType: "File", resourceId: file.id, before: { name: file.name, isVault: file.isVault } });

  const dest = file.isVault ? "/app/vault" : "/app/drive";
  revalidatePath(dest);
  redirect(`${dest}?toast=File deleted`);
}
