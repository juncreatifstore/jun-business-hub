import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { renderReceiptPdf } from "@/services/pdf";
import { clientCanAccessReceipt } from "@/lib/portal";

export const dynamic = "force-dynamic";

/** Official receipt PDF. Staff: PAYMENT_READ. CLIENT: only their own receipts. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const receipt = await prisma.receipt.findUnique({
    where: { id: params.id },
    include: { payment: { include: { case: true, createdBy: true } }, client: true },
  });
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role === "CLIENT") {
    const account = await prisma.clientAccount.findUnique({ where: { userId: user.id } });
    if (!account || !clientCanAccessReceipt(receipt, account.clientId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (!can(user, "PAYMENT_READ")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bytes = await renderReceiptPdf({
    reference: receipt.reference,
    clientName: `${receipt.client.firstName} ${receipt.client.lastName}`,
    clientInternalId: receipt.client.internalId,
    amount: Number(receipt.amount),
    currency: receipt.currency,
    method: receipt.payment.method,
    paymentReference: receipt.payment.reference,
    paidAt: receipt.payment.paidAt,
    issuedAt: receipt.issuedAt,
    caseNumber: receipt.payment.case?.caseNumber ?? null,
    reason: receipt.reason,
    issuerName: `${receipt.payment.createdBy.firstName} ${receipt.payment.createdBy.lastName}`,
  });

  await audit({ userId: user.id, action: "RECEIPT_DOWNLOAD", resourceType: "Receipt", resourceId: receipt.id, after: { reference: receipt.reference } });

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receipt.reference}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
