import "server-only";

import { prisma } from "@/lib/prisma";
import { getPaymentCoreMetaMap } from "@/lib/finance-payment-core";
import { invoiceFinancialState, listInvoices } from "@/lib/finance-invoices";
import { expenseEffectiveStatus, expensePaidTotal, listFinanceExpenses } from "@/lib/finance-expenses";

function round(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100; }

export type ServiceCurrencySummary = {
  currency: string;
  billed: number;
  invoicePaid: number;
  invoiceBalance: number;
  netReceived: number;
  transferFees: number;
  actualCost: number;
  committedCost: number;
  profit: number;
  marginPercent: number | null;
};

export type ClientServiceSummary = {
  caseId: string;
  caseNumber: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  ownerName: string | null;
  dueDate: Date | null;
  createdAt: Date;
  openTasks: number;
  documentCount: number;
  paymentCount: number;
  invoiceCount: number;
  expenseCount: number;
  currencies: ServiceCurrencySummary[];
};

export async function getClientServiceSummaries(clientId: string): Promise<ClientServiceSummary[]> {
  const [cases, allInvoices, allExpenses] = await Promise.all([
    prisma.case.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { firstName: true, lastName: true } },
        payments: { select: { id: true, amount: true, currency: true, status: true } },
        tasks: { select: { status: true } },
        _count: { select: { documents: true } },
      },
    }),
    listInvoices(5000),
    listFinanceExpenses(5000),
  ]);

  const clientInvoices = allInvoices.filter((i) => i.clientId === clientId && i.caseId);
  const clientExpenses = allExpenses.filter((e) => e.clientId === clientId && e.caseId);
  const paymentIds = cases.flatMap((c) => c.payments.map((p) => p.id));
  const paymentMeta = await getPaymentCoreMetaMap(paymentIds);

  const invoiceStates = new Map<string, Awaited<ReturnType<typeof invoiceFinancialState>>>();
  await Promise.all(clientInvoices.map(async (invoice) => {
    invoiceStates.set(invoice.id, await invoiceFinancialState(invoice));
  }));

  return cases.map((c) => {
    const invoices = clientInvoices.filter((i) => i.caseId === c.id);
    const expenses = clientExpenses.filter((e) => e.caseId === c.id);
    const currencies = new Map<string, ServiceCurrencySummary>();
    const bucket = (currency: string) => {
      const key = currency.toUpperCase();
      const current = currencies.get(key) || {
        currency: key,
        billed: 0,
        invoicePaid: 0,
        invoiceBalance: 0,
        netReceived: 0,
        transferFees: 0,
        actualCost: 0,
        committedCost: 0,
        profit: 0,
        marginPercent: null,
      };
      currencies.set(key, current);
      return current;
    };

    for (const invoice of invoices) {
      if (invoice.status === "CANCELLED") continue;
      const b = bucket(invoice.currency);
      const state = invoiceStates.get(invoice.id);
      b.billed = round(b.billed + invoice.total);
      b.invoicePaid = round(b.invoicePaid + (state?.paid || 0));
      b.invoiceBalance = round(b.invoiceBalance + (state?.balance || invoice.total));
    }

    for (const payment of c.payments) {
      if (!["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) continue;
      const gross = Number(payment.amount);
      const fee = Math.max(0, Number(paymentMeta.get(payment.id)?.feeAmount || 0));
      const net = Math.max(0, round(gross - fee));
      const b = bucket(payment.currency);
      b.netReceived = round(b.netReceived + net);
      b.transferFees = round(b.transferFees + Math.min(gross, fee));
    }

    for (const expense of expenses) {
      if (["REJECTED", "CANCELLED"].includes(expenseEffectiveStatus(expense))) continue;
      const b = bucket(expense.currency);
      b.actualCost = round(b.actualCost + expensePaidTotal(expense));
      if (["APPROVED", "PARTIALLY_PAID", "PAID"].includes(expenseEffectiveStatus(expense))) {
        b.committedCost = round(b.committedCost + expense.amount);
      }
    }

    for (const b of currencies.values()) {
      b.profit = round(b.netReceived - b.actualCost);
      b.marginPercent = b.netReceived > 0 ? round((b.profit / b.netReceived) * 100) : null;
    }

    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      type: c.type,
      title: c.title,
      description: c.description,
      status: c.status,
      priority: c.priority,
      ownerName: c.owner ? `${c.owner.firstName} ${c.owner.lastName}` : null,
      dueDate: c.dueDate,
      createdAt: c.createdAt,
      openTasks: c.tasks.filter((t) => !["DONE", "CANCELLED"].includes(t.status)).length,
      documentCount: c._count.documents,
      paymentCount: c.payments.length,
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      currencies: [...currencies.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    };
  });
}
