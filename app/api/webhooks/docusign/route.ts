import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sha256 } from "@/lib/hash";

export const dynamic = "force-dynamic";

/**
 * DocuSign Connect webhook (JSON). Security: HMAC-SHA256 of the RAW body with
 * DOCUSIGN_WEBHOOK_SECRET must match the X-DocuSign-Signature-1 header —
 * the body is never trusted without this verification.
 * On envelope-completed: fetch the signed PDF, store it, record its SHA-256,
 * mark request + document SIGNED with a full audit trail.
 */
const STATUS_MAP: Record<string, string> = {
  sent: "SENT",
  delivered: "VIEWED",
  completed: "SIGNED",
  declined: "DECLINED",
  voided: "VOIDED",
};

export async function POST(req: NextRequest) {
  const secret = process.env.DOCUSIGN_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const raw = Buffer.from(await req.arrayBuffer());
  const provided = req.headers.get("x-docusign-signature-1") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("base64");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: { event?: string; data?: { envelopeId?: string; envelopeSummary?: { status?: string; recipients?: { signers?: { email?: string; signedDateTime?: string }[] } } } };
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const envelopeId = body.data?.envelopeId;
  const dsStatus = (body.data?.envelopeSummary?.status ?? body.event?.replace("envelope-", "") ?? "").toLowerCase();
  const mapped = STATUS_MAP[dsStatus];
  if (!envelopeId || !mapped) return NextResponse.json({ ok: true, ignored: true });

  const request = await prisma.signatureRequest.findFirst({ where: { providerEnvelopeId: envelopeId, provider: "DOCUSIGN" }, include: { document: true, signers: true } });
  if (!request) return NextResponse.json({ ok: true, unknownEnvelope: true });
  if (["SIGNED", "VOIDED", "DECLINED"].includes(request.status)) return NextResponse.json({ ok: true, alreadyFinal: true });

  const trail = Array.isArray(request.auditTrail) ? (request.auditTrail as unknown[]) : [];
  trail.push({ at: new Date().toISOString(), event: `DOCUSIGN_${dsStatus.toUpperCase()}`, envelopeId });

  // Per-signer completion timestamps from the payload
  for (const s of body.data?.envelopeSummary?.recipients?.signers ?? []) {
    if (s.email && s.signedDateTime) {
      await prisma.signer.updateMany({ where: { signatureRequestId: request.id, email: s.email, signedAt: null }, data: { signedAt: new Date(s.signedDateTime) } });
    }
  }

  if (mapped === "SIGNED") {
    let signedPdfKey: string;
    let finalHash: string;

    try {
      const [{ docusignSignedPdf }, { storage, makeStorageKey }] = await Promise.all([import("@/lib/docusign"), import("@/lib/storage")]);
      const bytes = await docusignSignedPdf(envelopeId);
      signedPdfKey = makeStorageKey("signed", `${request.document.documentId}-signed.pdf`);
      await storage().upload(signedPdfKey, Buffer.from(bytes), "application/pdf");
      finalHash = sha256(Buffer.from(bytes));
      trail.push({ at: new Date().toISOString(), event: "SIGNED_PDF_STORED", hash: finalHash });
    } catch (e) {
      const error = e instanceof Error ? e.message : "unknown";
      trail.push({ at: new Date().toISOString(), event: "SIGNED_PDF_FETCH_FAILED", error });

      // DocuSign has completed the envelope, but JUN must not mark the internal
      // document as SIGNED until the exact signed PDF has been archived and
      // hashed successfully. Persist the failure and return a retriable error
      // so DocuSign Connect can redeliver the webhook.
      await prisma.signatureRequest.update({
        where: { id: request.id },
        data: { auditTrail: trail as object[] },
      });
      await audit({
        userId: null,
        action: "SIGNATURE_SIGNED_PDF_ARCHIVE_FAILED",
        resourceType: "SignatureRequest",
        resourceId: request.id,
        after: { envelopeId, documentId: request.document.documentId, error },
      });
      await prisma.notification.create({
        data: {
          userId: request.createdById,
          type: "SYSTEM",
          title: `${request.document.documentId} signed — archive pending`,
          body: "DocuSign completed the envelope, but JUN could not archive the signed PDF. The request remains pending and will be retried.",
          href: `/app/signatures/${request.id}`,
        },
      }).catch(() => undefined);

      return NextResponse.json({ error: "Signed PDF archival failed; retry required" }, { status: 503 });
    }

    await prisma.$transaction([
      prisma.signatureRequest.update({ where: { id: request.id }, data: { status: "SIGNED", signedPdfKey, finalHash, auditTrail: trail as object[] } }),
      prisma.document.update({ where: { id: request.documentId }, data: { status: "SIGNED", finalPdfKey: signedPdfKey, finalPdfHash: finalHash } }),
    ]);
    await audit({ userId: null, action: "SIGNATURE_COMPLETED_WEBHOOK", resourceType: "SignatureRequest", resourceId: request.id, after: { envelopeId, documentId: request.document.documentId, finalHash } });
    // Notify the request owner that the document is fully signed and archived.
    await prisma.notification.create({
      data: {
        userId: request.createdById,
        type: "CONTRACT_SIGNED",
        title: `${request.document.documentId} signed via DocuSign`,
        body: "All signers completed. Signed PDF archived with integrity hash.",
        href: `/app/signatures/${request.id}`,
      },
    }).catch(() => undefined);
  } else {
    await prisma.signatureRequest.update({ where: { id: request.id }, data: { status: mapped as never, auditTrail: trail as object[] } });
    await audit({ userId: null, action: `SIGNATURE_${mapped}_WEBHOOK`, resourceType: "SignatureRequest", resourceId: request.id, after: { envelopeId } });
  }

  return NextResponse.json({ ok: true });
}
