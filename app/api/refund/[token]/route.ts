import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { REASON_CODES, PAYOUT_METHODS, submitClaim } from "@/lib/refund-claims";
import { saveChannelAttachmentToDrive } from "@/lib/channel-attachments";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACCEPT = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;

/** Public submission of a refund claim (token-protected, rate-limited, honeypot). */
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimitAsync(`refundclaim:${ip}`, 10, 10 * 60_000)))
    return NextResponse.json({ ok: false, error: "Too many attempts, try again later." }, { status: 429 });
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token))
    return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const c = await prisma.refundClaim.findUnique({
    where: { token },
    include: { client: { select: { firstName: true, lastName: true } } },
  });
  if (!c) return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 404 });
  const fr = c.language === "fr";
  if (["CANCELLED", "EXPIRED"].includes(c.status) || c.expiresAt.getTime() < Date.now())
    return NextResponse.json(
      { ok: false, error: fr ? "Ce lien n’est plus valide." : "This link is no longer valid." },
      { status: 410 },
    );
  if (c.submittedAt)
    return NextResponse.json(
      { ok: false, error: fr ? "Demande déjà envoyée." : "Already submitted." },
      { status: 409 },
    );

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (String(fd.get("website") ?? "").trim()) return NextResponse.json({ ok: true }); // honeypot
  const str = (k: string, max = 200) =>
    String(fd.get(k) ?? "")
      .trim()
      .slice(0, max);

  const paymentId = c.paymentId ?? (str("paymentId", 64) || null);
  let currency = str("currency", 3).toUpperCase() || "USD";
  let max: number | null = null;
  if (paymentId) {
    const p = await prisma.payment.findFirst({
      where: { id: paymentId, clientId: c.clientId },
      select: { amount: true, currency: true },
    });
    if (!p)
      return NextResponse.json(
        { ok: false, error: fr ? "Paiement invalide." : "Invalid payment." },
        { status: 400 },
      );
    currency = p.currency;
    max = Number(p.amount);
  }
  const amount = Number(str("amount", 20));
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 10_000_000 ||
    (max !== null && amount > max + 0.005)
  )
    return NextResponse.json(
      { ok: false, error: fr ? "Montant invalide." : "Invalid amount." },
      { status: 400 },
    );
  const reasonCode = str("reasonCode", 40);
  if (!REASON_CODES.some((r) => r.code === reasonCode))
    return NextResponse.json(
      { ok: false, error: fr ? "Motif requis." : "Reason required." },
      { status: 400 },
    );
  const reason = str("reason", 2000);
  if (reason.length < 5)
    return NextResponse.json(
      { ok: false, error: fr ? "Merci de détailler le motif." : "Please detail the reason." },
      { status: 400 },
    );
  const payoutMethod = str("payoutMethod", 20);
  if (!PAYOUT_METHODS.some((m) => m.code === payoutMethod))
    return NextResponse.json(
      { ok: false, error: fr ? "Mode de remboursement requis." : "Refund method required." },
      { status: 400 },
    );
  const payoutDetails: Record<string, string> = {};
  if (payoutMethod === "BANK_TRANSFER") {
    for (const k of ["bankHolder", "bankName", "bankAccount", "bankSwift", "bankCountry"])
      if (str(k)) payoutDetails[k] = str(k);
    if (!payoutDetails.bankHolder || !payoutDetails.bankName || !payoutDetails.bankAccount)
      return NextResponse.json(
        { ok: false, error: fr ? "Coordonnées bancaires incomplètes." : "Incomplete bank details." },
        { status: 400 },
      );
  } else if (payoutMethod === "OTHER" && str("payoutOther")) payoutDetails.other = str("payoutOther");
  const contactEmail = str("contactEmail", 200) || null;
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    return NextResponse.json(
      { ok: false, error: fr ? "E-mail invalide." : "Invalid e-mail." },
      { status: 400 },
    );
  if (fd.get("consent") !== "on")
    return NextResponse.json(
      { ok: false, error: fr ? "Consentement requis." : "Consent required." },
      { status: 400 },
    );

  // Supporting files → Drive, linked to the client
  const fileIds: string[] = [];
  const files = fd
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 5);
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES || !ACCEPT.test(f.type)) continue;
    try {
      const ext = f.name.includes(".") ? f.name.slice(f.name.lastIndexOf(".")) : "";
      const { fileId } = await saveChannelAttachmentToDrive({
        userId: c.requestedById,
        name: `Justificatif remboursement — ${c.client.firstName} ${c.client.lastName}${ext}`.slice(0, 200),
        mimeType: f.type,
        data: Buffer.from(await f.arrayBuffer()),
        clientId: c.clientId,
        caseId: c.caseId,
        source: {
          channel: "PORTAL",
          ref: `refund:${c.id}:${fileIds.length}:${Date.now()}`,
          from: `${c.client.firstName} ${c.client.lastName}`,
        },
      });
      fileIds.push(fileId);
    } catch {}
  }

  try {
    await submitClaim(c.id, {
      paymentId,
      amount,
      currency,
      reasonCode,
      reason,
      payoutMethod,
      payoutDetails,
      contactEmail,
      contactPhone: str("contactPhone", 40) || null,
      fileIds,
      clientIp: ip,
    });
    await logActivity({
      userId: c.requestedById,
      type: "REFUND_CLAIM_SUBMITTED",
      message: `${c.client.firstName} ${c.client.lastName} a soumis une demande de remboursement de ${currency} ${amount.toFixed(2)}`,
      clientId: c.clientId,
      caseId: c.caseId ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Submission failed" },
      { status: 500 },
    );
  }
}
