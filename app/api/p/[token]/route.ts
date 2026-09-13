import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { PAY_METHODS, submitPaymentProof } from "@/lib/payment-requests";
import { saveChannelAttachmentToDrive } from "@/lib/channel-attachments";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ACCEPT = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/** Public: client submits a payment proof for a payment request. */
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`payproof:${ip}`, 10, 10 * 60_000)))
    return NextResponse.json({ ok: false, error: "Too many attempts" }, { status: 429 });
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
    return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const r = await prisma.paymentRequest.findUnique({
    where: { token },
    include: { client: { select: { firstName: true, lastName: true } } },
  });
  if (!r) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const fr = r.language === "fr";
  if (
    ["CANCELLED", "EXPIRED", "PAID", "PROOF_SUBMITTED"].includes(r.status) ||
    r.expiresAt.getTime() < Date.now()
  )
    return NextResponse.json(
      { ok: false, error: fr ? "Ce lien n’accepte plus de preuve." : "This link no longer accepts a proof." },
      { status: 409 },
    );
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (String(fd.get("website") ?? "").trim()) return NextResponse.json({ ok: true });
  const str = (k: string, max = 200) =>
    String(fd.get(k) ?? "")
      .trim()
      .slice(0, max);
  const method = str("method", 30);
  if (
    !PAY_METHODS.some((m) => m.code === method && m.code !== "ONLINE") ||
    (r.allowedMethods.length && !r.allowedMethods.includes(method))
  )
    return NextResponse.json(
      { ok: false, error: fr ? "Moyen de paiement invalide." : "Invalid payment method." },
      { status: 400 },
    );
  const amount = Number(str("amount", 20));
  const paidOn = str("paidOn", 10);
  const payerName = str("payerName", 160);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > Number(r.amount) * 1.5 + 1 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) ||
    payerName.length < 2
  )
    return NextResponse.json(
      { ok: false, error: fr ? "Informations incomplètes." : "Incomplete information." },
      { status: 400 },
    );
  const who = `${r.client.firstName} ${r.client.lastName}`;
  const fileIds: string[] = [];
  const files = fd
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 5);
  for (const [i, f] of files.entries()) {
    if (f.size > MAX_UPLOAD_BYTES || !ACCEPT.test(f.type || "image/jpeg")) continue;
    try {
      const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : ".jpg";
      const { fileId } = await saveChannelAttachmentToDrive({
        userId: r.requestedById,
        name: `Preuve de paiement${files.length > 1 ? ` ${i + 1}` : ""} — ${r.description} — ${who}${ext}`.slice(
          0,
          200,
        ),
        mimeType: f.type || "image/jpeg",
        data: Buffer.from(await f.arrayBuffer()),
        clientId: r.clientId,
        caseId: r.caseId,
        source: { channel: "PORTAL", ref: `payreq:${r.id}:${i}:${Date.now()}`, from: who },
      });
      fileIds.push(fileId);
    } catch {}
  }
  if (!fileIds.length)
    return NextResponse.json(
      {
        ok: false,
        error: fr ? "Preuve de paiement manquante ou illisible." : "Payment proof missing or unreadable.",
      },
      { status: 400 },
    );
  try {
    const { reference } = await submitPaymentProof(r.id, {
      method,
      reference: str("reference", 120),
      paidOn,
      amount,
      payerName,
      note: str("note", 500),
      fileIds,
      submittedAt: new Date().toISOString(),
      ip,
    });
    await logActivity({
      userId: r.requestedById,
      type: "PAYMENT_PROOF_SUBMITTED",
      message: `${who} a déposé une preuve de paiement (${r.currency} ${amount.toFixed(2)}, ${method}) — ${reference} à confirmer`,
      clientId: r.clientId,
      caseId: r.caseId ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
