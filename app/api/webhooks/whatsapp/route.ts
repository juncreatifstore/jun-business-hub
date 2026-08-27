import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppWebhookVerifyToken } from "@/lib/whatsapp";
import { recordIncomingWhatsAppMessage } from "@/lib/whatsapp-inbox";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const envToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "";
  const dbToken = await getWhatsAppWebhookVerifyToken();
  const expected = envToken || dbToken;
  const tokenMatches = Boolean(token && expected && token === expected);

  const diagnostic = {
    mode,
    tokenPresent: Boolean(token),
    challengePresent: Boolean(challenge),
    envTokenConfigured: Boolean(envToken),
    dbTokenConfigured: Boolean(dbToken),
    expectedTokenConfigured: Boolean(expected),
    tokenMatches,
    host: request.headers.get("host"),
    userAgent: request.headers.get("user-agent"),
  };

  if (mode === "subscribe" && tokenMatches && challenge) {
    console.warn("[WhatsApp webhook verify] SUCCESS", diagnostic);
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  // Use error level temporarily so the diagnostic is visible even when Vercel log filters hide info logs.
  console.error("[WhatsApp webhook verify] FAILED", diagnostic);
  return NextResponse.json(
    {
      ok: false,
      error: "Webhook verification failed",
      diagnostic: {
        mode,
        tokenPresent: Boolean(token),
        challengePresent: Boolean(challenge),
        envTokenConfigured: Boolean(envToken),
        dbTokenConfigured: Boolean(dbToken),
        expectedTokenConfigured: Boolean(expected),
        tokenMatches,
      },
    },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
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

  const origin = await prisma.activity.findFirst({
    where: { message: { contains: messageId } },
    orderBy: { createdAt: "desc" },
    select: { clientId: true, caseId: true, resourceType: true, resourceId: true },
  });

  const label = statusLabel(state);
  const recipient = status.recipient_id ? ` to ${status.recipient_id}` : "";
  const reason = state === "failed" ? ` · ${failureDetails(status)}` : "";

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

async function recordWebhookHeartbeat(input: { messages: number; statuses: number; entries: number }) {
  const value = JSON.stringify({
    receivedAt: new Date().toISOString(),
    messages: input.messages,
    statuses: input.statuses,
    entries: input.entries,
  });
  await prisma.appSetting.upsert({
    where: { key: "whatsapp.webhook.last_event" },
    create: { key: "whatsapp.webhook.last_event", value },
    update: { value },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    let messageCount = 0;
    let statusCount = 0;

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const statuses: MetaStatus[] = Array.isArray(value?.statuses) ? value.statuses : [];
        statusCount += statuses.length;
        for (const status of statuses) {
          await recordStatus(status).catch((error) => {
            console.error("[WhatsApp webhook status]", error);
          });
        }

        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const contactNames = new Map<string, string>();
        for (const contact of contacts) {
          const waId = String(contact?.wa_id || "").replace(/[^0-9]/g, "");
          const name = String(contact?.profile?.name || "").trim();
          if (waId && name) contactNames.set(waId, name);
        }

        const messages = Array.isArray(value?.messages) ? value.messages : [];
        messageCount += messages.length;
        for (const message of messages) {
          const from = String(message?.from || "").replace(/[^0-9]/g, "");
          await recordIncomingWhatsAppMessage({
            message,
            contactName: contactNames.get(from),
          }).catch((error) => {
            console.error("[WhatsApp webhook inbound]", error);
          });
        }
      }
    }

    await recordWebhookHeartbeat({ messages: messageCount, statuses: statusCount, entries: entries.length }).catch((error) => {
      console.error("[WhatsApp webhook heartbeat]", error);
    });

    console.info("[WhatsApp webhook] processed", { entries: entries.length, messages: messageCount, statuses: statusCount });
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[WhatsApp webhook] invalid payload", error);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
