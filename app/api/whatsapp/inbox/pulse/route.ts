import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/inbox/pulse
 * Tiny polling target for the inbox: a fingerprint of the latest activity and the
 * unread count. The client refreshes the page only when the fingerprint changes.
 */
export async function GET() {
  await requireUser();
  const [latest, unread] = await Promise.all([
    prisma.activity.findFirst({
      where: {
        resourceType: "WhatsAppConversation",
        type: { in: ["WHATSAPP_INBOUND_UNREAD", "WHATSAPP_INBOUND_READ", "WHATSAPP_OUTBOUND_REPLY"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, type: true, resourceId: true, message: true },
    }),
    prisma.activity.count({
      where: { resourceType: "WhatsAppConversation", type: "WHATSAPP_INBOUND_UNREAD" },
    }),
  ]);
  const inbound = latest?.type !== "WHATSAPP_OUTBOUND_REPLY";
  const preview = latest ? (/"text":"((?:[^"\\]|\\.)*)"/.exec(latest.message)?.[1] ?? "") : "";
  const name = latest ? (/"contactName":"((?:[^"\\]|\\.)*)"/.exec(latest.message)?.[1] ?? "") : "";
  return NextResponse.json(
    {
      stamp: latest ? `${latest.id}:${unread}` : `none:${unread}`,
      unread,
      latest: latest
        ? {
            at: latest.createdAt.toISOString(),
            inbound,
            phone: latest.resourceId,
            name,
            preview: preview.slice(0, 120),
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
