import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { answerClaimInformation } from "@/lib/refund-claims";
import { saveChannelAttachmentToDrive } from "@/lib/channel-attachments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ACCEPT = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/** Client reply to an information request on a refund claim. */
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`refundinfo:${ip}`, 10, 10 * 60_000)))
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  const c = await prisma.refundClaim.findUnique({
    where: { token },
    include: { client: { select: { firstName: true, lastName: true } } },
  });
  if (!c || c.status !== "NEEDS_INFO")
    return NextResponse.json({ ok: false, error: "Not expected" }, { status: 409 });
  const fd = await req.formData().catch(() => null);
  const text = String(fd?.get("text") ?? "")
    .trim()
    .slice(0, 3000);
  if (text.length < 5)
    return NextResponse.json(
      { ok: false, error: c.language === "fr" ? "Réponse trop courte." : "Reply too short." },
      { status: 400 },
    );
  const fileIds: string[] = [];
  const who = `${c.client.firstName} ${c.client.lastName}`;
  const files = (fd?.getAll("files") ?? [])
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 6);
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_UPLOAD_BYTES || !ACCEPT.test(f.type || "image/jpeg")) continue;
    try {
      const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : ".jpg";
      const { fileId } = await saveChannelAttachmentToDrive({
        userId: c.requestedById,
        name: `Complément ${i + 1} — remboursement — ${who}${ext}`.slice(0, 200),
        mimeType: f.type || "image/jpeg",
        data: Buffer.from(await f.arrayBuffer()),
        clientId: c.clientId,
        caseId: c.caseId,
        source: { channel: "PORTAL", ref: `refund-info:${c.id}:${i}:${Date.now()}`, from: who },
      });
      fileIds.push(fileId);
    } catch {}
  }
  await answerClaimInformation(c.id, text, fileIds);
  return NextResponse.json({ ok: true });
}
