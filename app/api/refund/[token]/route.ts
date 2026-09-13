import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { REASON_CODES, PAYOUT_METHODS, submitClaim, type ClaimFile } from "@/lib/refund-claims";
import { saveChannelAttachmentToDrive } from "@/lib/channel-attachments";
import { logActivity } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const ACCEPT = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/;
const ID_TYPES = new Set(["PASSPORT", "NATIONAL_ID", "DRIVER_LICENSE", "RESIDENCE_PERMIT"]);
const METHODS = new Set([
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "ZELLE",
  "PAYPAL",
  "MONCASH",
  "WESTERN_UNION",
  "OTHER",
]);
const SERVICES = new Set(["VISA", "TRAVEL", "DOCUMENTS", "DESIGN", "OTHER"]);

/** Public submission of a refund claim: identity, payment proof, service, reason, payout, declaration. */
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
  const bad = (frMsg: string, enMsg: string, status = 400) =>
    NextResponse.json({ ok: false, error: fr ? frMsg : enMsg }, { status });
  if (["CANCELLED", "EXPIRED"].includes(c.status) || c.expiresAt.getTime() < Date.now())
    return bad("Ce lien n’est plus valide.", "This link is no longer valid.", 410);
  if (c.submittedAt) return bad("Demande déjà envoyée.", "Already submitted.", 409);

  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  if (String(fd.get("website") ?? "").trim()) return NextResponse.json({ ok: true }); // honeypot
  const str = (k: string, max = 200) =>
    String(fd.get(k) ?? "")
      .trim()
      .slice(0, max);
  const num = (k: string) => Number(str(k, 24));

  // 1. Identity
  const fullName = str("fullName", 160);
  const dateOfBirth = str("dateOfBirth", 10);
  const idType = str("idType", 30);
  const idNumber = str("idNumber", 60);
  if (
    fullName.length < 3 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ||
    !ID_TYPES.has(idType) ||
    idNumber.length < 4
  )
    return bad("Identité incomplète.", "Identity incomplete.");

  // 2. Payment
  const paymentId = c.paymentId ?? (str("paymentId", 64) || null);
  let currency = str("currency", 3).toUpperCase() || "USD";
  let max: number | null = null;
  if (paymentId) {
    const p = await prisma.payment.findFirst({
      where: { id: paymentId, clientId: c.clientId },
      select: { amount: true, currency: true },
    });
    if (!p) return bad("Paiement invalide.", "Invalid payment.");
    currency = p.currency;
    max = Number(p.amount);
  }
  const paidOn = str("paidOn", 10);
  const paidAmount = num("paidAmount");
  const method = str("paymentMethod", 30);
  const paidTo = str("paidTo", 200);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) ||
    !Number.isFinite(paidAmount) ||
    paidAmount <= 0 ||
    !METHODS.has(method) ||
    !paidTo
  )
    return bad("Informations de paiement incomplètes.", "Payment details incomplete.");

  // 3. Service
  const serviceType = str("serviceType", 30);
  const serviceDescription = str("serviceDescription", 1000);
  if (!SERVICES.has(serviceType) || serviceDescription.length < 10)
    return bad("Décrivez le service concerné.", "Describe the service.");

  // 4. Reason
  const reasonCode = str("reasonCode", 40);
  if (!REASON_CODES.some((r) => r.code === reasonCode)) return bad("Motif requis.", "Reason required.");
  const reason = str("reason", 3000);
  if (reason.length < 40)
    return bad(
      "Merci de détailler le motif (40 caractères minimum).",
      "Please detail the reason (40 characters minimum).",
    );
  const fullRefund = fd.get("fullRefund") === "on";
  const amount = fullRefund ? (max ?? paidAmount) : num("amount");
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 10_000_000 ||
    (max !== null && amount > max + 0.005) ||
    amount > paidAmount + 0.005
  )
    return bad("Montant invalide.", "Invalid amount.");

  // 5. Payout + contact + declaration
  const payoutMethod = str("payoutMethod", 20);
  if (!PAYOUT_METHODS.some((m) => m.code === payoutMethod))
    return bad("Mode de remboursement requis.", "Refund method required.");
  const payoutDetails: Record<string, string> = {};
  if (payoutMethod === "BANK_TRANSFER") {
    for (const k of ["bankHolder", "bankName", "bankAccount", "bankSwift", "bankCountry"])
      if (str(k)) payoutDetails[k] = str(k);
    if (!payoutDetails.bankHolder || !payoutDetails.bankName || !payoutDetails.bankAccount)
      return bad("Coordonnées bancaires incomplètes.", "Incomplete bank details.");
  } else if (payoutMethod === "OTHER" && str("payoutOther")) payoutDetails.other = str("payoutOther");
  const contactEmail = str("contactEmail", 200) || null;
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
    return bad("E-mail invalide.", "Invalid e-mail.");
  const signature = str("signature", 160);
  if (signature.length < 3) return bad("Signature requise.", "Signature required.");
  if (fd.get("consent") !== "on") return bad("Consentement requis.", "Consent required.");

  // Files by role → Drive (linked to the client), typed by AI afterwards
  const who = `${c.client.firstName} ${c.client.lastName}`;
  const roles: Array<{
    field: string;
    role: ClaimFile["role"];
    label: string;
    required: boolean;
    max: number;
  }> = [
    { field: "file_id", role: "ID", label: fr ? "Pièce d’identité" : "ID document", required: true, max: 2 },
    {
      field: "file_selfie",
      role: "SELFIE",
      label: fr ? "Selfie avec pièce" : "Selfie with ID",
      required: true,
      max: 1,
    },
    {
      field: "file_proof",
      role: "PAYMENT_PROOF",
      label: fr ? "Preuve de paiement" : "Payment proof",
      required: true,
      max: 5,
    },
    {
      field: "file_evidence",
      role: "EVIDENCE",
      label: fr ? "Justificatif du motif" : "Reason evidence",
      required: false,
      max: 6,
    },
  ];
  const files: ClaimFile[] = [];
  for (const r of roles) {
    const list = fd
      .getAll(r.field)
      .filter((f): f is File => f instanceof File && f.size > 0)
      .slice(0, r.max);
    const valid = list.filter((f) => f.size <= MAX_UPLOAD_BYTES && ACCEPT.test(f.type || "image/jpeg"));
    if (r.required && !valid.length) return bad(`${r.label} manquant(e).`, `${r.label} missing.`);
    for (const [i, f] of valid.entries()) {
      try {
        const ext = f.name.includes(".")
          ? f.name.slice(f.name.lastIndexOf("."))
          : f.type === "application/pdf"
            ? ".pdf"
            : ".jpg";
        const name = `${r.label}${valid.length > 1 ? ` ${i + 1}` : ""} — remboursement — ${who}${ext}`.slice(
          0,
          200,
        );
        const { fileId } = await saveChannelAttachmentToDrive({
          userId: c.requestedById,
          name,
          mimeType: f.type || "image/jpeg",
          data: Buffer.from(await f.arrayBuffer()),
          clientId: c.clientId,
          caseId: c.caseId,
          source: { channel: "PORTAL", ref: `refund:${c.id}:${r.role}:${i}:${Date.now()}`, from: who },
        });
        files.push({ fileId, role: r.role, name });
      } catch {}
    }
    if (r.required && !files.some((f) => f.role === r.role))
      return bad(`${r.label} : envoi impossible.`, `${r.label}: upload failed.`, 500);
  }

  try {
    await submitClaim(c.id, {
      details: {
        identity: { fullName, dateOfBirth, idType, idNumber },
        payment: { paidOn, paidAmount, currency, method, reference: str("paymentReference", 120), paidTo },
        service: {
          type: serviceType,
          description: serviceDescription,
          caseReference: str("caseReference", 60),
          date: str("serviceDate", 10),
        },
        fullRefund,
        declaration: {
          signature,
          signedAt: new Date().toISOString(),
          ip,
          userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
        },
        files,
      },
      paymentId,
      amount,
      currency,
      reasonCode,
      reason,
      payoutMethod,
      payoutDetails,
      contactEmail,
      contactPhone: str("contactPhone", 40) || null,
      fileIds: files.map((f) => f.fileId),
      clientIp: ip,
    });
    await logActivity({
      userId: c.requestedById,
      type: "REFUND_CLAIM_SUBMITTED",
      message: `${who} a soumis une demande de remboursement de ${currency} ${amount.toFixed(2)} (${files.length} pièce(s))`,
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
