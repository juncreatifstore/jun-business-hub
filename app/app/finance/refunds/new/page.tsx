import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { RefundForm } from "@/components/app/refund-form";

export const dynamic = "force-dynamic";

export default async function NewRefundPage({ searchParams }: { searchParams: { clientId?: string; caseId?: string } }) {
  await requirePermission("REFUND_CREATE");
  const [clients, cases, payments] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, internalId: true } }),
    prisma.case.findMany({ where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, caseNumber: true, title: true } }),
    prisma.payment.findMany({ where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED"] } }, orderBy: { paidAt: "desc" }, select: { id: true, reference: true, amount: true, currency: true, clientId: true } }),
  ]);
  return (
    <div>
      <PageHeader title="New refund request" subtitle="Requests go through review and approval before any installment can be paid." />
      <RefundForm
        clients={clients}
        cases={cases}
        payments={payments.map((p) => ({ ...p, amount: Number(p.amount) }))}
        defaultClientId={searchParams.clientId}
        defaultCaseId={searchParams.caseId}
      />
    </div>
  );
}
