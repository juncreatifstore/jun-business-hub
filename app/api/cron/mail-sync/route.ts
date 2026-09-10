import { NextResponse } from "next/server";
import { syncAllMailboxesUnattended } from "@/services/mail-sync-v2";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Vercel Cron → every 5 minutes (vercel.json). Syncs every connected mailbox
 * and pre-renders the latest conversations so the Mail page never waits on
 * Gmail. Protected by CRON_SECRET (set automatically by Vercel for crons).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const started = Date.now();
  const results = await syncAllMailboxesUnattended();
  const ms = Date.now() - started;
  logger.info("mail.cron_sync", { ms, results });
  return NextResponse.json({ ok: results.every((r) => r.ok), ms, results });
}
