import { randomUUID } from "crypto";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { HistoricalFinancialBackfillForm } from "@/components/app/historical-financial-backfill-form";

export const dynamic = "force-dynamic";

export default async function HistoricalBackfillPage(props: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const searchParams = await props.searchParams;
  await requirePermission("PAYMENT_APPROVE");
  await requirePermission("REFUND_APPROVE");

  const [clients, cases] = await Promise.all([
    prisma.client.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, internalId: true },
    }),
    prisma.case.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, clientId: true, caseNumber: true, title: true },
      take: 2000,
    }),
  ]);

  return (
    <div className="max-w-7xl space-y-5">
      <PageHeader
        title="Historical finance backfill"
        subtitle="Enter old payments and refunds that happened before they were recorded in JUN — all in one audited batch."
      />
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Use this page only for late historical entry. Payments entered here become <strong>CONFIRMED</strong>{" "}
        immediately and refunds that were already completed become <strong>PAID</strong> immediately, using
        the original transaction dates. This also works for inactive or archived clients because the action
        records past history rather than creating a new commercial transaction. The data becomes available to
        statements and JUN AI document drafting.
      </div>
      <HistoricalFinancialBackfillForm
        clients={clients}
        cases={cases}
        batchId={randomUUID()}
        defaultClientId={searchParams.clientId}
      />
    </div>
  );
}
