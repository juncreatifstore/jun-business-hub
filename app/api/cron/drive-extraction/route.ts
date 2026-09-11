import { NextResponse } from "next/server";
import { backfillFileExtractions } from "@/services/drive-intelligence";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Hourly: analyse Drive files that have no extraction yet (8 per run). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await backfillFileExtractions(8, 90_000);
  logger.info("drive.extraction_backfill", { ms: Date.now() - started, ...result });
  return NextResponse.json({ ok: true, ...result });
}
