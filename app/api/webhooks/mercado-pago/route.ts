import { NextRequest, NextResponse } from "next/server";
import { fetchMercadoPagoPayment, verifyMercadoPagoWebhook } from "@/lib/finance-online-providers";
import { getOnlinePaymentSession, hasWebhookEvent, markOnlineSessionStatus, registerWebhookEvent } from "@/lib/finance-online-payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const dataId = req.nextUrl.searchParams.get("data.id") || req.nextUrl.searchParams.get("data_id");
  if (!verifyMercadoPagoWebhook(req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) return new NextResponse("Invalid signature", { status: 401 });
  let event: any = {};
  try { event = await req.json(); } catch {}
  const eventId = String(event?.id || `${event?.action || "payment"}:${dataId || ""}`);
  if (eventId && await hasWebhookEvent("MERCADO_PAGO", eventId)) return NextResponse.json({ received: true, duplicate: true });
  if (!dataId) return NextResponse.json({ received: true, ignored: true });

  try {
    const payment = await fetchMercadoPagoPayment(dataId);
    const sessionId = String(payment?.external_reference || "");
    const session = sessionId ? await getOnlinePaymentSession(sessionId) : null;
    if (session) {
      const status = String(payment?.status || "");
      if (status === "approved") await markOnlineSessionStatus(session.id, "PAID", { providerPaymentId: String(payment?.id || dataId) });
      else if (status === "rejected") await markOnlineSessionStatus(session.id, "FAILED", { providerPaymentId: String(payment?.id || dataId), error: String(payment?.status_detail || "Mercado Pago payment rejected") });
      else if (["cancelled", "refunded", "charged_back"].includes(status) && session.status !== "PAID") await markOnlineSessionStatus(session.id, "CANCELLED", { providerPaymentId: String(payment?.id || dataId), error: status });
    }
    if (eventId) await registerWebhookEvent("MERCADO_PAGO", eventId);
    return NextResponse.json({ received: true, ignored: !session });
  } catch {
    return new NextResponse("Unable to verify payment", { status: 503 });
  }
}
