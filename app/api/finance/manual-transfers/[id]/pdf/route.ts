import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getManualTransferOrder } from "@/lib/finance-manual-transfers";
import { renderManualTransferOrderPdf } from "@/services/pdf/manual-transfer-order";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("PAYMENT_READ");

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing manual transfer order id" }, { status: 400 });
    }

    const order = await getManualTransferOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Manual transfer order not found" }, { status: 404 });
    }

    const bytes = await renderManualTransferOrderPdf(order);
    const safeFileName = String(order.orderNumber || "manual-payment-order")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "manual-payment-order";

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFileName}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[manual-transfer-pdf] generation failed", error);
    return NextResponse.json(
      { error: "Unable to generate payment order PDF" },
      { status: 500 },
    );
  }
}
