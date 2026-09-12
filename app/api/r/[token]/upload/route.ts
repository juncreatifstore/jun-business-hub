import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { attachReceivedFile, parseItems, docLabel } from "@/lib/document-requests";
import { saveChannelAttachmentToDrive } from "@/lib/channel-attachments";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACCEPT = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/** Public upload endpoint for a document request (token-protected, rate-limited). */
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`docreq:${ip}`, 30, 10 * 60_000)))
    return NextResponse.json({ ok: false, error: "Too many uploads, try again later." }, { status: 429 });
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
    return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const r = await prisma.documentRequest.findUnique({
    where: { token },
    include: { client: { select: { firstName: true, lastName: true } } },
  });
  if (!r) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const fr = r.language === "fr";
  if (r.status === "CANCELLED" || r.status === "EXPIRED" || r.expiresAt.getTime() < Date.now())
    return NextResponse.json(
      { ok: false, error: fr ? "Ce lien n’est plus valide." : "This link is no longer valid." },
      { status: 410 },
    );

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  const index = Number(fd?.get("index"));
  const items = parseItems(r.items);
  if (!(file instanceof File) || !Number.isInteger(index) || !items[index])
    return NextResponse.json(
      { ok: false, error: fr ? "Fichier manquant." : "Missing file." },
      { status: 400 },
    );
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json(
      { ok: false, error: fr ? "Fichier trop volumineux (15 Mo max)." : "File too large (15 MB max)." },
      { status: 413 },
    );
  if (!ACCEPT.test(file.type))
    return NextResponse.json(
      { ok: false, error: fr ? "Format non accepté : photo ou PDF." : "Unsupported format: photo or PDF." },
      { status: 415 },
    );

  const data = Buffer.from(await file.arrayBuffer());
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf("."))
    : file.type === "application/pdf"
      ? ".pdf"
      : ".jpg";
  const name =
    `${docLabel(items[index].docType, r.language)} — ${r.client.firstName} ${r.client.lastName}${ext}`.slice(
      0,
      200,
    );
  try {
    const { fileId } = await saveChannelAttachmentToDrive({
      userId: r.requestedById,
      name,
      mimeType: file.type,
      data,
      clientId: r.clientId,
      caseId: r.caseId,
      source: {
        channel: "PORTAL",
        ref: `${r.id}:${index}:${Date.now()}`,
        from: `${r.client.firstName} ${r.client.lastName}`,
      },
    });
    await attachReceivedFile(r.id, index, fileId, name);
    await prisma.documentRequest.update({ where: { id: r.id }, data: { lastViewedAt: new Date() } });
    await logActivity({
      userId: r.requestedById,
      type: "DOCUMENT_RECEIVED",
      message: `${r.client.firstName} ${r.client.lastName} a déposé « ${docLabel(items[index].docType, "fr")} » via le lien de demande`,
      clientId: r.clientId,
      caseId: r.caseId ?? undefined,
    });
    return NextResponse.json({ ok: true, fileName: name });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
