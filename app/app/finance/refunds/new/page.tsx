import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { RefundForm } from "@/components/app/refund-form";

export const dynamic = "force-dynamic";

export default async function NewRefundPage({ searchParams }: { searchParams: { clientId?: string; caseId?: string } }) {
  await requirePermission("REFUND_CREATE");
  const [clients, cases, payments] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, internalId: true } }),
    prisma.case.findMany({ where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, clientId: true, caseNumber: true, title: true } }),
    prisma.payment.findMany({ where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } }, orderBy: { paidAt: "desc" }, select: { id: true, reference: true, amount: true, currency: true, clientId: true, refunds: { select: { amount: true, status: true } } } }),
  ]);
  const refundables = payments.map((p) => {
    const committed = p.refunds.filter((r) => !["REJECTED", "CANCELLED"].includes(r.status)).reduce((sum, r) => sum + Number(r.amount), 0);
    return { id: p.id, reference: p.reference, amount: Number(p.amount), available: Math.max(0, Math.round((Number(p.amount) - committed) * 100) / 100), currency: p.currency, clientId: p.clientId };
  });
  return <div>
    <PageHeader title="New refund request" subtitle="Create a controlled refund request linked to the original payment whenever possible." />
    <RefundForm clients={clients} cases={cases} payments={refundables} defaultClientId={searchParams.clientId} defaultCaseId={searchParams.caseId} />
  </div>;
}
