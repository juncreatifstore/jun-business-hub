import { NextRequest, NextResponse } from "next/server";
import { capturePaypalOrder, verifyPaypalWebhook } from "@/lib/finance-online-providers";
import { getOnlineSessionByProviderId, hasWebhookEvent, markOnlineSessionStatus, registerWebhookEvent } from "@/lib/finance-online-payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let event: any;
  try { event = await req.json(); } catch { return new NextResponse("Invalid payload", { status: 400 }); }
  if (!(await verifyPaypalWebhook(req.headers, event))) return new NextResponse("Invalid signature", { status: 401 });
  const eventId = String(event?.id || "");
  if (eventId && await hasWebhookEvent("PAYPAL", eventId)) return NextResponse.json({ received: true, duplicate: true });

  const type = String(event?.event_type || "");
  const resource = event?.resource || {};
  const orderId = String(resource?.supplementary_data?.related_ids?.order_id || resource?.id || "");
  const session = orderId ? await getOnlineSessionByProviderId("PAYPAL", orderId) : null;
  if (!session) {
    if (eventId) await registerWebhookEvent("PAYPAL", eventId);
    return NextResponse.json({ received: true, ignored: true });
  }

  if (type === "CHECKOUT.ORDER.APPROVED") {
    if (["CANCELLED", "EXPIRED"].includes(session.status)) {
      if (eventId) await registerWebhookEvent("PAYPAL", eventId);
      return NextResponse.json({ received: true, ignored: true });
    }
    try {
      const captured = await capturePaypalOrder(orderId);
      if (captured.completed) await markOnlineSessionStatus(session.id, "PAID", { providerPaymentId: captured.captureId || orderId });
    } catch {
      return new NextResponse("PayPal capture temporarily unavailable", { status: 503 });
    }
  } else if (type === "PAYMENT.CAPTURE.COMPLETED") {
    await markOnlineSessionStatus(session.id, "PAID", { providerPaymentId: String(resource?.id || orderId) });
  } else if (["PAYMENT.CAPTURE.DENIED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED"].includes(type)) {
    await markOnlineSessionStatus(session.id, "FAILED", { providerPaymentId: String(resource?.id || ""), error: type });
  }
  if (eventId) await registerWebhookEvent("PAYPAL", eventId);
  return NextResponse.json({ received: true });
}
