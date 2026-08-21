import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getManualTransferOrder } from "@/lib/finance-manual-transfers";
import { renderManualTransferOrderPdf } from "@/services/pdf/manual-transfer-order";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requirePermission("PAYMENT_READ");
  const order = await getManualTransferOrder(params.id);
  if (!order) return NextResponse.json({ error: "Manual transfer order not found" }, { status: 404 });
  const bytes = await renderManualTransferOrderPdf(order);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${order.orderNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
