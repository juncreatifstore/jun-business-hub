import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { renderReceiptPdf } from "@/services/pdf";
import { clientCanAccessReceipt } from "@/lib/portal";

export const dynamic = "force-dynamic";

/**
 * Official receipt PDF generated from a confirmed payment.
 * Staff: PAYMENT_READ. CLIENT: only payments belonging to their own client record.
 * `id` may be either the Payment.id or its public Payment.reference.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [{ id: params.id }, { reference: params.id }],
    },
    include: {
      case: true,
      recordedBy: true,
      client: true,
    },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role === "CLIENT") {
    const account = await prisma.clientAccount.findUnique({ where: { userId: user.id } });
    if (!account || !clientCanAccessReceipt({ clientId: payment.clientId }, account.clientId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (!can(user, "PAYMENT_READ")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const issuedAt = payment.paidAt ?? payment.createdAt;
  const receiptReference = `RCT-${payment.reference}`;

  const bytes = await renderReceiptPdf({
    reference: receiptReference,
    clientName: `${payment.client.firstName} ${payment.client.lastName}`,
    clientInternalId: payment.client.internalId,
    amount: Number(payment.amount),
    currency: payment.currency,
    method: payment.method,
    paymentReference: payment.reference,
    paidAt: payment.paidAt,
    issuedAt,
    caseNumber: payment.case?.caseNumber ?? null,
    reason: payment.notes ?? null,
    issuerName: `${payment.recordedBy.firstName} ${payment.recordedBy.lastName}`,
  });

  await audit({
    userId: user.id,
    action: "RECEIPT_DOWNLOAD",
    resourceType: "Payment",
    resourceId: payment.id,
    after: { reference: receiptReference, paymentReference: payment.reference },
  });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receiptReference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
