import { NextRequest, NextResponse } from "next/server";
import { capturePaypalOrder } from "@/lib/finance-online-providers";
import { getOnlinePaymentSessionByToken, markOnlineSessionStatus } from "@/lib/finance-online-payments";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const session = await getOnlinePaymentSessionByToken(params.token);
  const destination = new URL(`/pay/${encodeURIComponent(params.token)}`, req.url);
  if (!session || session.provider !== "PAYPAL" || !session.providerSessionId) {
    destination.searchParams.set("result", "invalid");
    return NextResponse.redirect(destination);
  }
  if (session.status === "PAID") {
    destination.searchParams.set("result", "success");
    return NextResponse.redirect(destination);
  }
  try {
    const captured = await capturePaypalOrder(session.providerSessionId);
    if (captured.completed) {
      await markOnlineSessionStatus(session.id, "PAID", { providerPaymentId: captured.captureId || session.providerSessionId });
      destination.searchParams.set("result", "success");
    } else {
      destination.searchParams.set("result", "pending");
    }
  } catch (error) {
    await markOnlineSessionStatus(session.id, "FAILED", { error: error instanceof Error ? error.message : "PayPal capture failed" });
    destination.searchParams.set("result", "failure");
  }
  return NextResponse.redirect(destination);
}
