import { NextRequest, NextResponse } from "next/server";
import { capturePaypalOrder, verifyPaypalWebhook } from "@/lib/finance-online-providers";
import { getOnlineSessionByProviderId, markOnlineSessionStatus, registerWebhookEvent } from "@/lib/finance-online-payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let event: any;
  try { event = await req.json(); } catch { return new NextResponse("Invalid payload", { status: 400 }); }
  if (!(await verifyPaypalWebhook(req.headers, event))) return new NextResponse("Invalid signature", { status: 401 });
  if (!(await registerWebhookEvent("PAYPAL", String(event?.id || "")))) return NextResponse.json({ received: true, duplicate: true });

  const type = String(event?.event_type || "");
  const resource = event?.resource || {};
  const orderId = String(resource?.id || resource?.supplementary_data?.related_ids?.order_id || "");
  const session = orderId ? await getOnlineSessionByProviderId("PAYPAL", orderId) : null;
  if (!session) return NextResponse.json({ received: true, ignored: true });

  if (type === "CHECKOUT.ORDER.APPROVED") {
    try {
      const captured = await capturePaypalOrder(orderId);
      if (captured.completed) await markOnlineSessionStatus(session.id, "PAID", { providerPaymentId: captured.captureId || orderId });
    } catch (error) {
      await markOnlineSessionStatus(session.id, "FAILED", { error: error instanceof Error ? error.message : "PayPal capture failed" });
    }
  } else if (type === "PAYMENT.CAPTURE.COMPLETED") {
    await markOnlineSessionStatus(session.id, "PAID", { providerPaymentId: String(resource?.id || orderId) });
  } else if (["PAYMENT.CAPTURE.DENIED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED"].includes(type)) {
    await markOnlineSessionStatus(session.id, "FAILED", { providerPaymentId: String(resource?.id || ""), error: type });
  }
  return NextResponse.json({ received: true });
}
