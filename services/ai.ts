"use server";
import { prisma } from "@/lib/prisma";
import { assertPermission, can, type CurrentUser } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { revalidatePath } from "next/cache";

const BLOCKED_TOPICS = [
  "refund", "remboursement", "dispute", "conflict", "legal", "lawyer", "avocat",
  "contract", "contrat", "bank", "banque", "iban", "routing", "wire",
];

export async function classifyEmailAILevel(subject: string, body: string): Promise<"AUTO" | "APPROVAL_REQUIRED" | "BLOCKED"> {
  const text = `${subject} ${body}`.toLowerCase();
  if (BLOCKED_TOPICS.some((t) => text.includes(t))) return "BLOCKED";
  const amounts = text.match(/\$?\s?(\d[\d,]*\.?\d*)/g) ?? [];
  if (amounts.some((a) => Number(a.replace(/[^0-9.]/g, "")) >= 1000)) return "BLOCKED";
  if (/thank you|received|acknowledg|accusé|nous avons bien reçu/.test(text)) return "AUTO";
  return "APPROVAL_REQUIRED";
}

async function openaiChat(messages: { role: string; content: string }[]): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.25 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

type ToolResult = { tool: string; ok: boolean; data?: unknown; error?: string };

async function runTool(user: CurrentUser, name: string, arg: string): Promise<ToolResult> {
  const deny = (p: string): ToolResult => ({ tool: name, ok: false, error: `You lack the ${p} permission, so JUN AI cannot use this tool for you.` });
  switch (name) {
    case "searchClients": {
      if (!can(user, "CLIENT_READ")) return deny("CLIENT_READ");
      const data = await prisma.client.findMany({
        where: { OR: [{ firstName: { contains: arg, mode: "insensitive" } }, { lastName: { contains: arg, mode: "insensitive" } }, { internalId: { contains: arg, mode: "insensitive" } }] },
        take: 5,
        select: { id: true, internalId: true, firstName: true, lastName: true, email: true, status: true },
      });
      return { tool: name, ok: true, data };
    }
    case "searchCases": {
      if (!can(user, "CASE_READ")) return deny("CASE_READ");
      const data = await prisma.case.findMany({
        where: { OR: [{ title: { contains: arg, mode: "insensitive" } }, { caseNumber: { contains: arg, mode: "insensitive" } }] },
        take: 5,
        select: { id: true, caseNumber: true, title: true, status: true, priority: true },
      });
      return { tool: name, ok: true, data };
    }
    case "searchDocuments": {
      if (!can(user, "DOCUMENT_READ")) return deny("DOCUMENT_READ");
      const data = await prisma.document.findMany({
        where: { OR: [{ title: { contains: arg, mode: "insensitive" } }, { documentId: { contains: arg, mode: "insensitive" } }] },
        take: 5,
        select: { id: true, documentId: true, title: true, type: true, status: true },
      });
      return { tool: name, ok: true, data };
    }
    case "searchPayments": {
      if (!can(user, "PAYMENT_READ")) return deny("PAYMENT_READ");
      const data = await prisma.payment.findMany({
        where: { OR: [{ reference: { contains: arg, mode: "insensitive" } }, { client: { lastName: { contains: arg, mode: "insensitive" } } }] },
        take: 5,
        select: { id: true, reference: true, amount: true, currency: true, status: true },
      });
      return { tool: name, ok: true, data: data.map((p) => ({ ...p, amount: Number(p.amount) })) };
    }
    default:
      return { tool: name, ok: false, error: "Unknown tool" };
  }
}

function formatToolResult(result: ToolResult, query: string): string {
  if (!result.ok) return `⚠ ${result.error ?? "The search could not be completed."}`;

  const rows = Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
  if (rows.length === 0) {
    const labels: Record<string, string> = {
      searchClients: "client",
      searchCases: "case",
      searchDocuments: "document",
      searchPayments: "payment",
    };
    const label = labels[result.tool] ?? "result";
    return `I couldn't find any ${label} matching “${query}”.`;
  }

  switch (result.tool) {
    case "searchClients":
      return `I found ${rows.length} client${rows.length === 1 ? "" : "s"}:\n${rows.map((r) => {
        const name = `${String(r.firstName ?? "")} ${String(r.lastName ?? "")}`.trim();
        const email = r.email ? ` · ${String(r.email)}` : "";
        return `• ${name || "Unnamed client"} — ${String(r.internalId ?? "No ID")} · ${String(r.status ?? "UNKNOWN")}${email}`;
      }).join("\n")}`;
    case "searchCases":
      return `I found ${rows.length} case${rows.length === 1 ? "" : "s"}:\n${rows.map((r) => `• ${String(r.caseNumber ?? "No number")} — ${String(r.title ?? "Untitled")} · ${String(r.status ?? "UNKNOWN")} · ${String(r.priority ?? "")}`).join("\n")}`;
    case "searchDocuments":
      return `I found ${rows.length} document${rows.length === 1 ? "" : "s"}:\n${rows.map((r) => `• ${String(r.documentId ?? "No ID")} — ${String(r.title ?? "Untitled")} · ${String(r.type ?? "")} · ${String(r.status ?? "UNKNOWN")}`).join("\n")}`;
    case "searchPayments":
      return `I found ${rows.length} payment${rows.length === 1 ? "" : "s"}:\n${rows.map((r) => {
        const amount = typeof r.amount === "number" ? r.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(r.amount ?? "0.00");
        return `• ${String(r.reference ?? "No reference")} — ${String(r.currency ?? "USD")} ${amount} · ${String(r.status ?? "UNKNOWN")}`;
      }).join("\n")}`;
    default:
      return `I found ${rows.length} result${rows.length === 1 ? "" : "s"}.`;
  }
}

export async function sendAIMessage(conversationId: string | null, formData: FormData) {
  const user = await assertPermission("AI_USE");
  const { rateLimitAsync } = await import("@/lib/rate-limit");
  if (!(await rateLimitAsync(`ai:${user.id}`, 30, 60_000))) return;
  const content = String(formData.get("message") ?? "").trim().slice(0, 4000);
  if (!content) return;

  let convId = conversationId;
  if (!convId) {
    const conv = await prisma.aIConversation.create({ data: { userId: user.id, title: content.slice(0, 60) } });
    convId = conv.id;
  } else {
    const conv = await prisma.aIConversation.findUnique({ where: { id: convId } });
    if (!conv || conv.userId !== user.id) return;
  }

  await prisma.aIMessage.create({ data: { conversationId: convId, role: "user", content } });

  let reply: string;
  if (!process.env.OPENAI_API_KEY) {
    const toolMatch = content.match(/^search (clients|cases|documents|payments)\s+(.+)/i);
    if (toolMatch) {
      const map: Record<string, string> = { clients: "searchClients", cases: "searchCases", documents: "searchDocuments", payments: "searchPayments" };
      const query = toolMatch[2].trim();
      const result = await runTool(user, map[toolMatch[1].toLowerCase()], query);
      reply = formatToolResult(result, query);
    } else {
      reply = "JUN AI is not connected to a model yet (OPENAI_API_KEY is not configured). You can still search JUN data with commands such as: search clients <name>, search cases <query>, search documents <query>, or search payments <query>.";
    }
  } else {
    const { generateText, stepCountIs } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const { buildAITools } = await import("@/lib/ai/tools");
    const history = await prisma.aIMessage.findMany({ where: { conversationId: convId }, orderBy: { createdAt: "asc" }, take: 24 });
    try {
      const result = await generateText({
        model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
        system: "You are JUN AI, the internal assistant of JUN CREATIF AND TRAVEL LLC. Be concise and professional. Use tools to look up real data instead of guessing. You may create drafts, but never finalize documents, sign, send emails, or approve payments/refunds without human approval. Never reveal secrets, tokens, passwords or full identity-document data.",
        messages: history.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content })),
        tools: buildAITools(user),
        stopWhen: stepCountIs(5),
      });
      reply = result.text || "(no answer)";
    } catch (e) {
      reply = `JUN AI error: ${e instanceof Error ? e.message : "model call failed"}. Try again or use tool commands like \`search clients <name>\`.`;
    }
  }

  await prisma.aIMessage.create({ data: { conversationId: convId, role: "assistant", content: reply } });
  revalidatePath("/app/ai");
  const { redirect } = await import("next/navigation");
  redirect(`/app/ai?c=${convId}`);
}

export async function generateDocumentDraft(formData: FormData): Promise<{ content?: string; error?: string }> {
  const user = await assertPermission("DOCUMENT_CREATE");
  const instruction = String(formData.get("instruction") ?? "").trim().slice(0, 2000);
  const clientId = String(formData.get("clientId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!instruction) return { error: "Write an instruction first." };

  const documentDate = new Date();
  const isoDate = documentDate.toISOString().slice(0, 10);
  let context = `Document date: ${isoDate}. Use this real date; do not output [DATE].\n`;

  if (clientId && can(user, "CLIENT_READ")) {
    const [client, companyRows] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        include: {
          payments: {
            where: { status: { in: ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
            orderBy: { createdAt: "asc" },
            take: 100,
          },
          refunds: {
            where: { status: { notIn: ["REJECTED", "CANCELLED"] } },
            orderBy: { createdAt: "asc" },
            include: { installments: { orderBy: { number: "asc" } } },
            take: 100,
          },
        },
      }),
      prisma.appSetting.findMany({
        where: { key: { in: ["company.legal_representative", "company.representative_title"] } },
        select: { key: true, value: true },
      }).catch(() => []),
    ]);

    if (client) {
      const company = Object.fromEntries(companyRows.map((r) => [r.key, r.value]));
      context += `Client: ${client.firstName} ${client.lastName} (${client.internalId}), email ${client.email ?? "n/a"}, country ${client.country ?? "n/a"}.\n`;
      context += `Authorized company representative: ${company["company.legal_representative"] || "not configured"}. Title: ${company["company.representative_title"] || "not configured"}.\n`;

      if (can(user, "PAYMENT_READ") && client.payments.length) {
        const totals = new Map<string, number>();
        for (const p of client.payments) totals.set(p.currency, (totals.get(p.currency) || 0) + Number(p.amount));
        context += `Historical confirmed client payments (include every one of these in any final-account/termination document):\n${client.payments.map((p) => `- ${p.reference} | ${p.currency} ${Number(p.amount).toFixed(2)} | received ${((p.paidAt || p.createdAt) as Date).toISOString().slice(0, 10)} | current status ${p.status}`).join("\n")}\n`;
        context += `Total historical confirmed payments by currency: ${[...totals.entries()].map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join("; ")}.\n`;
      } else if (can(user, "PAYMENT_READ")) {
        context += "Historical confirmed client payments: none found.\n";
      }

      if (can(user, "REFUND_READ")) {
        const refundRows = client.refunds.map((refund) => {
          const paid = refund.installments.filter((i) => i.status === "PAID").reduce((sum, i) => sum + Number(i.amount), 0);
          const remaining = Math.max(0, Number(refund.amount) - paid);
          const paidDates = refund.installments.filter((i) => i.status === "PAID" && i.paidAt).map((i) => i.paidAt!.toISOString().slice(0, 10));
          return { refund, paid, remaining, paidDates };
        });
        const paidRefunds = refundRows.filter((x) => x.paid > 0);
        const openRefunds = refundRows.filter((x) => x.remaining > 0.005 && ["REQUESTED", "UNDER_REVIEW", "APPROVED", "PARTIALLY_PAID"].includes(x.refund.status));
        if (paidRefunds.length) {
          context += `Refunds already paid to the client (state these explicitly):\n${paidRefunds.map((x) => `- ${x.refund.refundNumber} | ${x.refund.currency} ${x.paid.toFixed(2)} paid | original requested ${x.refund.currency} ${Number(x.refund.amount).toFixed(2)} | status ${x.refund.status} | paid date(s) ${x.paidDates.join(", ") || "recorded in system"}`).join("\n")}\n`;
        } else {
          context += "Refunds already paid to the client: none recorded as paid.\n";
        }
        if (openRefunds.length) {
          context += `Refund amounts still due / still in process (state these explicitly and do not call them paid):\n${openRefunds.map((x) => `- ${x.refund.refundNumber} | ${x.refund.currency} ${x.remaining.toFixed(2)} remaining | status ${x.refund.status}`).join("\n")}\n`;
        } else {
          context += "Refund amounts still due / in process: none.\n";
        }
      }
    }
  }

  if (caseId && can(user, "CASE_READ")) {
    const c = await prisma.case.findUnique({ where: { id: caseId } });
    if (c) context += `Case: ${c.caseNumber} — ${c.title} (${c.status}).\n`;
  }

  const ai = await openaiChat([
    {
      role: "system",
      content: "You draft formal professional business documents for JUN CREATIF AND TRAVEL LLC as clean HTML using only h1, h2, p, ul, li and table elements; no scripts or inline styles. Use the exact factual financial data supplied in context and never omit a supplied payment or refund when the document concerns account closure, relationship termination, refunds, or a final notice. Never invent transactions, dates, amounts, legal citations, signatures, or facts. Use the supplied Document date and never output [DATE]. Drafts are unsigned, but end formal notices with a professional signature block identifying JUN CREATIF AND TRAVEL LLC and the configured authorized representative/title when available; if representative data is not configured, use clear lines for Name, Title, Signature and Date rather than writing 'Signature: [SIGNATURE]'. If the instruction concerns termination of the commercial relationship, structure the document with clear sections: purpose/decision, financial history, refunds already completed, remaining refund obligation, final account settlement, effects of termination, finality of decision, records/statement, and signature block. Explicitly state that any remaining approved amount will be paid through the refund workflow; after all refunds and obligations are settled the client will receive a final statement showing a zero balance (0.00). State that the company's decision to terminate the commercial relationship is final and not subject to appeal or internal reconsideration, while preserving any rights that cannot legally be waived. State that no new commercial service or transaction will be accepted after final termination. Be explicit, formal, neutral and detailed; do not use vague promises such as 'as soon as possible' when the system only shows a pending workflow. Never state that a pending refund has already been paid.",
    },
    { role: "user", content: `${context}\nInstruction: ${instruction}\nReturn only the HTML body of the draft.` },
  ]);

  await logActivity({ type: "AI_DRAFT", message: "AI document draft generated", userId: user.id, clientId: clientId || null, caseId: caseId || null });

  if (ai) return { content: ai };
  return {
    content: `<h1>Draft</h1><p><em>Generated offline (no OPENAI_API_KEY configured). Edit freely.</em></p><p>Document date: ${isoDate}</p><p>Instruction: ${instruction.replace(/</g, "&lt;")}</p>${context ? `<p>Context: ${context.replace(/</g, "&lt;")}</p>` : ""}<p>[BODY — complete this draft]</p><h2>For JUN CREATIF AND TRAVEL LLC</h2><p>Name: ____________________</p><p>Title: ____________________</p><p>Signature: ____________________</p><p>Date: ${isoDate}</p>`,
  };
}

export async function proposeAIAction(tool: string, args: Record<string, unknown>, _conversationId?: string) {
  const user = await assertPermission("AI_USE");
  const action = await prisma.aIAction.create({
    data: { userId: user.id, tool, args: args as never },
  });
  await audit({ userId: user.id, action: "AI_ACTION_PROPOSED", resourceType: "AIAction", resourceId: action.id, after: { tool } });
  revalidatePath("/app/ai");
}

export async function reviewAIAction(actionId: string, formData: FormData) {
  const user = await assertPermission("AI_APPROVE");
  const decision = String(formData.get("decision") ?? "");
  if (!["APPROVED", "REJECTED"].includes(decision)) return;
  const action = await prisma.aIAction.findUnique({ where: { id: actionId } });
  if (!action || action.status !== "PROPOSED") return;

  if (decision === "REJECTED") {
    await prisma.aIAction.update({
      where: { id: actionId },
      data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), result: { approved: false } },
    });
    await audit({ userId: user.id, action: "AI_ACTION_REJECTED", resourceType: "AIAction", resourceId: actionId });
    revalidatePath("/app/ai");
    return;
  }

  await prisma.aIAction.update({
    where: { id: actionId },
    data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
  });

  try {
    let result: Record<string, unknown> = { approved: true };
    if (action.tool === "SEND_EMAIL") {
      const args = action.args as { threadId?: string };
      if (!args.threadId) throw new Error("SEND_EMAIL action is missing threadId");
      result = { approved: true, threadId: args.threadId, note: "Human approval recorded. Email sending remains controlled by the Mail send action." };
    }
    await prisma.aIAction.update({ where: { id: actionId }, data: { status: "EXECUTED", result: result as never } });
    await audit({ userId: user.id, action: "AI_ACTION_APPROVED", resourceType: "AIAction", resourceId: actionId, after: { tool: action.tool } });
  } catch (e) {
    await prisma.aIAction.update({
      where: { id: actionId },
      data: { status: "FAILED", result: { error: e instanceof Error ? e.message : "Execution failed" } },
    });
  }
  revalidatePath("/app/ai");
}