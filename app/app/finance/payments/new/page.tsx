import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { PaymentForm } from "@/components/app/payment-form";
import { getFinancePaymentAccounts } from "@/lib/finance-payment-accounts";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage({ searchParams }: { searchParams: { clientId?: string; caseId?: string } }) {
  await requirePermission("PAYMENT_CREATE");
  const [clients, cases, paymentAccounts] = await Promise.all([
    prisma.client.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true, internalId: true } }),
    prisma.case.findMany({ where: { status: { notIn: ["ARCHIVED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, select: { id: true, caseNumber: true, title: true } }),
    getFinancePaymentAccounts({ enabledOnly: true }),
  ]);
  return (
    <div>
      <PageHeader title="Record payment" subtitle="A payment stays Pending until a finance approver confirms it." />
      <PaymentForm clients={clients} cases={cases} paymentAccounts={paymentAccounts} defaultClientId={searchParams.clientId} defaultCaseId={searchParams.caseId} />
    </div>
  );
}
