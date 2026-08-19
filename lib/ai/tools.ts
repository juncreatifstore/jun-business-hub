import "server-only";
import { z } from "zod";
import { tool } from "ai";
import { prisma } from "@/lib/prisma";
import { can, type CurrentUser } from "@/lib/auth";
import { htmlToText } from "@/lib/sanitize";

/**
 * JUN AI tools — every tool re-checks the CURRENT USER's permission before touching
 * the database. The model can request a tool, but RBAC is enforced server-side here;
 * the AI can never bypass it. Results are minimized: ids, names, statuses, short
 * summaries — never passwords, tokens, full passport data or entire documents.
 */
const DENIED = { error: "Permission denied for this tool" } as const;

export function buildAITools(user: CurrentUser) {
  return {
    searchClients: tool({
      description: "Search clients by name, email or internal id (JUN-CLI-…). Returns up to 8 matches.",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      execute: async ({ query }) => {
        if (!can(user, "CLIENT_READ")) return DENIED;
        const ci = { contains: query, mode: "insensitive" as const };
        const rows = await prisma.client.findMany({
          where: { OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { internalId: ci }] },
          take: 8,
          select: { id: true, internalId: true, firstName: true, lastName: true, status: true, email: true },
        });
        return rows;
      },
    }),
    getClient: tool({
      description: "Get one client by database id or internal id (JUN-CLI-…). Minimal profile + counts.",
      inputSchema: z.object({ id: z.string().min(1).max(60) }),
      execute: async ({ id }) => {
        if (!can(user, "CLIENT_READ")) return DENIED;
        const c = await prisma.client.findFirst({
          where: { OR: [{ id }, { internalId: id }] },
          include: { _count: { select: { cases: true, documents: true, payments: true, refunds: true } } },
        });
        if (!c) return { error: "Client not found" };
        return { id: c.id, internalId: c.internalId, name: `${c.firstName} ${c.lastName}`, status: c.status, email: c.email, phone: c.phone, country: c.country, counts: c._count };
      },
    }),
    searchCases: tool({
      description: "Search cases by title, number (CASE-…) or description.",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      execute: async ({ query }) => {
        if (!can(user, "CASE_READ")) return DENIED;
        const ci = { contains: query, mode: "insensitive" as const };
        return prisma.case.findMany({
          where: { OR: [{ title: ci }, { caseNumber: ci }, { description: ci }] },
          take: 8,
          select: { id: true, caseNumber: true, title: true, status: true, priority: true, clientId: true },
        });
      },
    }),
    getCase: tool({
      description: "Get one case by id or case number, with client name and open task count.",
      inputSchema: z.object({ id: z.string().min(1).max(60) }),
      execute: async ({ id }) => {
        if (!can(user, "CASE_READ")) return DENIED;
        const c = await prisma.case.findFirst({
          where: { OR: [{ id }, { caseNumber: id }] },
          include: { client: { select: { firstName: true, lastName: true, internalId: true } }, _count: { select: { tasks: true, documents: true } } },
        });
        if (!c) return { error: "Case not found" };
        return { id: c.id, caseNumber: c.caseNumber, title: c.title, status: c.status, priority: c.priority, client: `${c.client.firstName} ${c.client.lastName} (${c.client.internalId})`, counts: c._count };
      },
    }),
    searchDocuments: tool({
      description: "Search documents by title or id (JUN-CTR-…, JUN-AGR-…).",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      execute: async ({ query }) => {
        if (!can(user, "DOCUMENT_READ")) return DENIED;
        const ci = { contains: query, mode: "insensitive" as const };
        return prisma.document.findMany({
          where: { OR: [{ title: ci }, { documentId: ci }] },
          take: 8,
          select: { id: true, documentId: true, title: true, type: true, status: true },
        });
      },
    }),
    getDocument: tool({
      description: "Get one document's metadata + a short plain-text excerpt of the latest version (never the full HTML).",
      inputSchema: z.object({ id: z.string().min(1).max(60) }),
      execute: async ({ id }) => {
        if (!can(user, "DOCUMENT_READ")) return DENIED;
        const d = await prisma.document.findFirst({
          where: { OR: [{ id }, { documentId: id }] },
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        });
        if (!d) return { error: "Document not found" };
        const excerpt = htmlToText(d.versions[0]?.content ?? "").slice(0, 800);
        return { id: d.id, documentId: d.documentId, title: d.title, type: d.type, status: d.status, latestVersion: d.versions[0]?.version ?? 0, excerpt };
      },
    }),
    searchPayments: tool({
      description: "Search payments by reference (PAY-…) or notes.",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      execute: async ({ query }) => {
        if (!can(user, "PAYMENT_READ")) return DENIED;
        const ci = { contains: query, mode: "insensitive" as const };
        const rows = await prisma.payment.findMany({
          where: { OR: [{ reference: ci }, { notes: ci }] },
          take: 8,
          include: { client: { select: { firstName: true, lastName: true } } },
        });
        return rows.map((p) => ({ id: p.id, reference: p.reference, amount: Number(p.amount), currency: p.currency, method: p.method, status: p.status, client: `${p.client.firstName} ${p.client.lastName}` }));
      },
    }),
    getPayment: tool({
      description: "Get one payment by id or reference.",
      inputSchema: z.object({ id: z.string().min(1).max(60) }),
      execute: async ({ id }) => {
        if (!can(user, "PAYMENT_READ")) return DENIED;
        const p = await prisma.payment.findFirst({ where: { OR: [{ id }, { reference: id }] }, include: { client: { select: { firstName: true, lastName: true, internalId: true } }, receipt: { select: { reference: true } } } });
        if (!p) return { error: "Payment not found" };
        return { id: p.id, reference: p.reference, amount: Number(p.amount), currency: p.currency, method: p.method, status: p.status, paidAt: p.paidAt, client: `${p.client.firstName} ${p.client.lastName}`, receipt: p.receipt?.reference ?? null };
      },
    }),
    searchRefunds: tool({
      description: "Search refunds by reference (REF-…) or reason.",
      inputSchema: z.object({ query: z.string().min(1).max(100) }),
      execute: async ({ query }) => {
        if (!can(user, "REFUND_READ")) return DENIED;
        const ci = { contains: query, mode: "insensitive" as const };
        const rows = await prisma.refund.findMany({ where: { OR: [{ reference: ci }, { reason: ci }] }, take: 8, include: { installments: true } });
        return rows.map((r) => ({ id: r.id, reference: r.reference, amount: Number(r.amount), currency: r.currency, status: r.status, installments: r.installments.length, installmentsPaid: r.installments.filter((i) => i.status === "PAID").length }));
      },
    }),
    getRefund: tool({
      description: "Get one refund by id or reference with its installment schedule.",
      inputSchema: z.object({ id: z.string().min(1).max(60) }),
      execute: async ({ id }) => {
        if (!can(user, "REFUND_READ")) return DENIED;
        const r = await prisma.refund.findFirst({ where: { OR: [{ id }, { reference: id }] }, include: { installments: { orderBy: { dueDate: "asc" } }, client: { select: { firstName: true, lastName: true } } } });
        if (!r) return { error: "Refund not found" };
        return { id: r.id, reference: r.reference, amount: Number(r.amount), currency: r.currency, status: r.status, reason: r.reason, client: `${r.client.firstName} ${r.client.lastName}`, installments: r.installments.map((i) => ({ due: i.dueDate, amount: Number(i.amount), status: i.status })) };
      },
    }),
    createDocumentDraft: tool({
      description: "Create a DRAFT document (never final, never signed). Provide type, title, HTML-free body text; optional clientId/caseId. Returns the new document id for the human to review.",
      inputSchema: z.object({
        type: z.enum(["CONTRACT", "AGREEMENT", "REFUND_AGREEMENT", "RECEIPT", "INVOICE", "LETTER", "ATTESTATION", "AUTHORIZATION", "REPORT", "CUSTOM"]),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(20000),
        clientId: z.string().optional(),
        caseId: z.string().optional(),
      }),
      execute: async (input) => {
        if (!can(user, "DOCUMENT_CREATE")) return DENIED;
        const { createDraftFromAI } = await import("@/services/ai-executors");
        return createDraftFromAI(user, input);
      },
    }),
    createReceiptDraft: tool({
      description: "Create a RECEIPT-type DRAFT document for a confirmed payment (by payment reference). A human finalizes it.",
      inputSchema: z.object({ paymentReference: z.string().min(1).max(40) }),
      execute: async ({ paymentReference }) => {
        if (!can(user, "DOCUMENT_CREATE") || !can(user, "PAYMENT_READ")) return DENIED;
        const { createReceiptDraftFromAI } = await import("@/services/ai-executors");
        return createReceiptDraftFromAI(user, paymentReference);
      },
    }),
    createTaskDraft: tool({
      description: "Create a TODO task assigned to nobody (the human assigns it). Provide title, optional description, optional caseId/clientId, optional dueDate ISO.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        caseId: z.string().optional(),
        clientId: z.string().optional(),
        dueDate: z.string().optional(),
      }),
      execute: async (input) => {
        if (!can(user, "TASK_CREATE")) return DENIED;
        const { createTaskFromAI } = await import("@/services/ai-executors");
        return createTaskFromAI(user, input);
      },
    }),
  };
}
