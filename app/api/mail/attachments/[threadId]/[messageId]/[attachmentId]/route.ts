import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertMailboxAccess } from "@/lib/mail-security";
import { fetchGmailAttachment } from "@/lib/channel-attachments";

export const dynamic = "force-dynamic";

/** Streams an e-mail attachment through the hub (inline preview or download). */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ threadId: string; messageId: string; attachmentId: string }> },
) {
  const { threadId, messageId, attachmentId } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const thread = await prisma.mailThread.findUnique({
    where: { id: threadId },
    select: { mailAccountId: true },
  });
  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await assertMailboxAccess(user, thread.mailAccountId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const name = (req.nextUrl.searchParams.get("name") || "attachment").replace(/[\r\n"]/g, "_").slice(0, 200);
  const type = (req.nextUrl.searchParams.get("type") || "application/octet-stream").slice(0, 120);
  const download = req.nextUrl.searchParams.get("download") === "1";
  try {
    const data = await fetchGmailAttachment(thread.mailAccountId, messageId, attachmentId);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unavailable" }, { status: 502 });
  }
}
