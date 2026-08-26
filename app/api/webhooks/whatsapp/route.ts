import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppWebhookVerifyToken } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expected = await getWhatsAppWebhookVerifyToken();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ ok: false, error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Meta requires a fast 200 response. Incoming message/status processing can be
    // expanded later without changing the callback URL.
    console.info("[WhatsApp webhook]", JSON.stringify(body));
    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
