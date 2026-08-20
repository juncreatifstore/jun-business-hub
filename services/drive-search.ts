"use server";

import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { indexDriveFile } from "@/lib/drive-intelligence";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function reindexDriveLibrary(): Promise<void> {
  const user = await assertPermission("FILE_UPLOAD");
  const files = await prisma.file.findMany({
    where: { isVault: false, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true },
  });
  let indexed = 0;
  for (const file of files) {
    try { await indexDriveFile(file.id); indexed++; } catch {}
  }
  await audit({ userId: user.id, action: "DRIVE_LIBRARY_REINDEX", resourceType: "Drive", after: { indexed, requested: files.length } });
  revalidatePath("/app/drive/search");
  redirect(`/app/drive/search?toast=${encodeURIComponent(`Indexed ${indexed} files`)}`);
}
