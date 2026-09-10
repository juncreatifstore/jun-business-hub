import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { fetchWhatsAppMedia } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/whatsapp/media/:id
 * Serves an inbound WhatsApp media (voice note, image, video, document).
 * - staff session required
 * - the id must belong to a message we actually received (no open proxy)
 * - first request pulls the file from Meta and caches it in our storage,
 *   so it stays available after Meta's ~30-day retention window
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const id = params.id;
  if (!/^[0-9]{5,40}$/.test(id)) return new NextResponse("Bad id", { status: 400 });

  const known = await prisma.activity.findFirst({
    where: { resourceType: "WhatsAppConversation", message: { contains: `"mediaId":"${id}"` } },
    select: { id: true, message: true },
  });
  if (!known) return new NextResponse("Not found", { status: 404 });

  const key = `whatsapp/media/${id}`;
  const store = storage();
  let bytes: Buffer | null = null;
  let mimeType = "application/octet-stream";
  try {
    bytes = await store.download(key);
    mimeType = guessMime(known.message) || mimeType;
  } catch {
    bytes = null;
  }
  if (!bytes) {
    try {
      const fetched = await fetchWhatsAppMedia(id);
      bytes = fetched.bytes;
      mimeType = fetched.mimeType;
      store
        .upload(key, bytes, mimeType)
        .catch((err) => logger.warn("whatsapp.media_cache_failed", { id, err }));
    } catch (err) {
      logger.error("whatsapp.media_fetch_failed", { id, err });
      return new NextResponse("Media unavailable (expired at Meta or WhatsApp not configured)", {
        status: 502,
      });
    }
  }

  const filename = /"filename":"([^"]+)"/.exec(known.message)?.[1];
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline${filename ? `; filename="${encodeURIComponent(filename)}"` : ""}`,
      "Accept-Ranges": "bytes",
    },
  });
}

function guessMime(payload: string) {
  const type = /"type":"([a-z_]+)"/.exec(payload)?.[1];
  if (type === "audio") return "audio/ogg";
  if (type === "image" || type === "sticker") return "image/jpeg";
  if (type === "video") return "video/mp4";
  if (type === "document") return "application/pdf";
  return null;
}
