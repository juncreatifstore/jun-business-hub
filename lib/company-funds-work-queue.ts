import "server-only";

import { unstable_cache } from "next/cache";
import { listFinancialAuthorizations } from "@/lib/company-funds-approvals";
import { listFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
import { getFinancialReserveDashboard } from "@/lib/company-funds-reserves";
import { listTreasuryTransfers } from "@/lib/company-funds-transfers";
import { listBankTransactions } from "@/lib/finance-bank-reconciliation";

export type CompanyFundsWorkQueue = {
  total: number;
  authorizations: number;
  transfers: number;
  reconciliation: number;
  evidence: number;
  reserves: number;
};

async function computeCompanyFundsWorkQueue(): Promise<CompanyFundsWorkQueue> {
  const [authorizations, evidence, transfers, bankTransactions, reserves] = await Promise.all([
    listFinancialAuthorizations(5000),
    listFinancialExecutionEvidence(5000),
    listTreasuryTransfers(),
    listBankTransactions(),
    getFinancialReserveDashboard(),
  ]);

  const pendingAuthorizations = authorizations.filter(a => a.status === "PENDING");
  const evidenceAuthorizationIds = new Set(evidence.map(e => e.authorizationId));
  const approvedWithoutEvidence = authorizations.filter(
    a => a.status === "APPROVED" && !evidenceAuthorizationIds.has(a.id),
  );
  const transfersInTransit = transfers.filter(t => ["INITIATED", "IN_TRANSIT"].includes(t.status));
  const unreconciled = bankTransactions.filter(t => !["MATCHED", "IGNORED"].includes(t.status));
  const criticalReserveAlerts = reserves.alerts.filter(a => a.type === "CRITICAL");

  const queue = {
    authorizations: pendingAuthorizations.length,
    transfers: transfersInTransit.length,
    reconciliation: unreconciled.length,
    evidence: approvedWithoutEvidence.length,
    reserves: criticalReserveAlerts.length,
  };

  return {
    ...queue,
    total: queue.authorizations + queue.transfers + queue.reconciliation + queue.evidence + queue.reserves,
  };
}

const getCachedCompanyFundsWorkQueue = unstable_cache(
  computeCompanyFundsWorkQueue,
  ["company-funds-work-queue-v1"],
  { revalidate: 10 },
);

export async function getCompanyFundsWorkQueue(): Promise<CompanyFundsWorkQueue> {
  return getCachedCompanyFundsWorkQueue();
}
