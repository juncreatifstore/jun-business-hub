import { NextResponse } from "next/server";
import { processDocumentRequestReminders } from "@/lib/document-requests";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily: expire stale document requests and send reminders (max 3 per request). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (secret && auth !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await processDocumentRequestReminders();
  logger.info("document_requests.cron", result);
  return NextResponse.json({ success: true, ...result });
}
