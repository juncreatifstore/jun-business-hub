"use server";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runDriveBackup } from "@/lib/drive-backup";

export async function runDriveBackupNow(): Promise<void> {
  const user = await assertPermission("SETTINGS_MANAGE");
  const r = await runDriveBackup(40, 50_000);
  await audit({
    userId: user.id,
    action: "DRIVE_BACKUP_RUN",
    resourceType: "Drive",
    resourceId: "backup",
    after: r,
  });
  redirect(
    `/app/drive/enterprise?${r.ok ? "toast" : "toast_error"}=${encodeURIComponent(r.ok ? `Sauvegarde : ${r.copied} copié(s), ${r.failed} échec(s), ${r.pending} restant(s)` : r.reason)}`,
  );
}
