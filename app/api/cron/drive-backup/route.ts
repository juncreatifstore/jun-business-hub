import { NextResponse } from "next/server";
import { runDriveBackup } from "@/lib/drive-backup";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Hourly off-site copy of Drive files to the connected Google Drive. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runDriveBackup(40, 90_000);
  logger.info("drive.backup", result);
  return NextResponse.json({ success: true, ...result });
}
