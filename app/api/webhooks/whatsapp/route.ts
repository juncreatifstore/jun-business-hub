import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppWebhookVerifyToken } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";

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

type MetaStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
};

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "sent") return "SENT";
  if (s === "delivered") return "DELIVERED";
  if (s === "read") return "READ";
  if (s === "failed") return "FAILED";
  return s.toUpperCase();
}

function failureDetails(status: MetaStatus) {
  const err = status.errors?.[0];
  if (!err) return "Meta did not provide a failure reason.";
  const parts = [
    err.code != null ? `code ${err.code}` : "",
    err.title || "",
    err.message || "",
    err.error_data?.details || "",
  ].filter(Boolean);
  return parts.join(" · ").slice(0, 1500);
}

async function recordStatus(status: MetaStatus) {
  const messageId = String(status.id || "").trim();
  const state = String(status.status || "").trim().toLowerCase();
  if (!messageId || !state) return;

  // Outbound send activities already contain Meta's wamid. Reuse that record to
  // attach delivery callbacks to the same client/document without a schema change.
  const origin = await prisma.activity.findFirst({
    where: { message: { contains: messageId } },
    orderBy: { createdAt: "desc" },
    select: { clientId: true, caseId: true, resourceType: true, resourceId: true },
  });

  const label = statusLabel(state);
  const recipient = status.recipient_id ? ` to ${status.recipient_id}` : "";
  const reason = state === "failed" ? ` · ${failureDetails(status)}` : "";

  // Meta may retry webhooks. Avoid duplicate status rows for the same wamid/state.
  const duplicate = await prisma.activity.findFirst({
    where: {
      type: `WHATSAPP_${label}`,
      message: { contains: messageId },
    },
    select: { id: true },
  });
  if (duplicate) return;

  await prisma.activity.create({
    data: {
      type: `WHATSAPP_${label}`,
      message: `WhatsApp ${label}${recipient} · ${messageId}${reason}`,
      clientId: origin?.clientId ?? undefined,
      caseId: origin?.caseId ?? undefined,
      resourceType: origin?.resourceType ?? "WhatsAppMessage",
      resourceId: origin?.resourceId ?? messageId,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const statuses: MetaStatus[] = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
        for (const status of statuses) {
          await recordStatus(status).catch((error) => {
            console.error("[WhatsApp webhook status]", error);
          });
        }
      }
    }

    // Keep a concise log for troubleshooting incoming messages and unexpected events.
    console.info("[WhatsApp webhook]", JSON.stringify(body));
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[WhatsApp webhook] invalid payload", error);
    // Meta requires a fast 200 response to avoid unnecessary retries.
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
