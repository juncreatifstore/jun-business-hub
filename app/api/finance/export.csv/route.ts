import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";

export const dynamic = "force-dynamic";

function csv(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, "PAYMENT_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [payments, refunds] = await Promise.all([
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 5000, include: { client: { select: { firstName: true, lastName: true, internalId: true } }, case: { select: { caseNumber: true } } } }),
    prisma.refund.findMany({ orderBy: { createdAt: "desc" }, take: 3000, include: { client: { select: { firstName: true, lastName: true, internalId: true } }, payment: { select: { reference: true } }, installments: true } }),
  ]);
  const meta = await getPaymentCoreMetaMap(payments.map((p) => p.id));
  const rows: string[] = [];
  rows.push(["record_type","reference","date","client_id","client","case","status","method","currency","gross_amount","fees","net_amount","original_payment","notes"].map(csv).join(","));
  for (const p of payments) {
    const fee = Number(meta.get(p.id)?.feeAmount || 0);
    rows.push(["PAYMENT",p.reference,(p.paidAt || p.createdAt).toISOString(),p.client.internalId,`${p.client.firstName} ${p.client.lastName}`,p.case?.caseNumber || "",p.status,p.method,p.currency,Number(p.amount).toFixed(2),fee.toFixed(2),(Number(p.amount)-fee).toFixed(2),"",p.notes || meta.get(p.id)?.serviceLabel || ""].map(csv).join(","));
  }
  for (const r of refunds) {
    const paid = r.installments.filter((i) => i.status === "PAID").reduce((sum,i) => sum + Number(i.amount),0);
    rows.push(["REFUND",r.refundNumber,r.createdAt.toISOString(),r.client.internalId,`${r.client.firstName} ${r.client.lastName}`,"",r.status,"REFUND",r.currency,Number(r.amount).toFixed(2),"",(-paid).toFixed(2),r.payment?.reference || "",r.reason].map(csv).join(","));
  }
  const body = `\uFEFF${rows.join("\r\n")}`;
  const stamp = new Date().toISOString().slice(0,10);
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="jun-finance-${stamp}.csv"`, "Cache-Control": "private, no-store" } });
}
