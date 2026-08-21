import { NextRequest, NextResponse } from "next/server";
import { hasWebhookEvent, markOnlineSessionStatus, registerWebhookEvent } from "@/lib/finance-online-payments";
import { verifyStripeWebhook } from "@/lib/finance-online-providers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyStripeWebhook(raw, req.headers.get("stripe-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  let event: any;
  try { event = JSON.parse(raw); } catch { return new NextResponse("Invalid payload", { status: 400 }); }
  const eventId = String(event.id || "");
  if (eventId && await hasWebhookEvent("STRIPE", eventId)) return NextResponse.json({ received: true, duplicate: true });

  const object = event?.data?.object || {};
  const sessionId = String(object?.metadata?.jun_session_id || object?.client_reference_id || "");
  if (sessionId) {
    if (event.type === "checkout.session.completed" && object.payment_status === "paid") {
      await markOnlineSessionStatus(sessionId, "PAID", { providerPaymentId: String(object.payment_intent || object.id || "") });
    } else if (event.type === "checkout.session.expired") {
      await markOnlineSessionStatus(sessionId, "EXPIRED");
    } else if (event.type === "payment_intent.payment_failed") {
      await markOnlineSessionStatus(sessionId, "FAILED", { providerPaymentId: String(object.id || ""), error: String(object?.last_payment_error?.message || "Stripe payment failed") });
    }
  }
  if (eventId) await registerWebhookEvent("STRIPE", eventId);
  return NextResponse.json({ received: true, ignored: !sessionId });
}
