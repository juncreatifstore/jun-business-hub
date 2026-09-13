import { NextResponse } from "next/server";
import { processDocumentRequestReminders } from "@/lib/document-requests";
import { processRefundClaimReminders, processClaimSlaAlerts } from "@/lib/refund-claims";
import { processPaymentRequestReminders } from "@/lib/payment-requests";
import { generateScheduledAutoTasks } from "@/lib/auto-tasks";
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
  const refunds = await processRefundClaimReminders().catch(() => ({ due: 0, reminded: 0 }));
  const sla = await processClaimSlaAlerts().catch(() => ({ due: 0, alerted: 0 }));
  const payReq = await processPaymentRequestReminders().catch(() => ({ due: 0, reminded: 0 }));
  const tasks = await generateScheduledAutoTasks().catch(() => ({ expiring: 0, chased: 0 }));
  logger.info("document_requests.cron", {
    ...result,
    refundClaims: refunds,
    sla,
    paymentRequests: payReq,
    tasks,
  });
  return NextResponse.json({
    success: true,
    ...result,
    refundClaims: refunds,
    sla,
    paymentRequests: payReq,
    tasks,
  });
}
