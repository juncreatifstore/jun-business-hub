"use server";
// JUN AI — architecture:
//  * openaiChat(): thin adapter over the OpenAI API (key from env only; the app
//    degrades gracefully when OPENAI_API_KEY is not configured).
//  * TOOLS: every tool re-checks the *calling user's* permissions. The AI can
//    never read or do anything the signed-in user could not do — RBAC is not bypassable.
//  * AIAction: sensitive actions (sending email, etc.) are only ever PROPOSED by
//    the AI; a human with AI_APPROVE must approve before execution.
import { prisma } from "@/lib/prisma";
import { assertPermission, can, type CurrentUser } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";
import { revalidatePath } from "next/cache";

// ── Email automation policy (JUN Mail AI levels) ─────────────────────────────
// AUTO: simple acknowledgements only. APPROVAL_REQUIRED: AI drafts, human sends.
// BLOCKED: AI must never auto-send — refunds, disputes, large payments, legal,
// contractual commitments, banking details.
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

// ── OpenAI adapter ───────────────────────────────────────────────────────────
async function openaiChat(messages: { role: string; content: string }[]): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0.4 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

// ── Permission-checked tools ─────────────────────────────────────────────────
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

// ── Chat (Vercel AI SDK + permission-checked tools) ─────────────────────────
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
    if (!conv || conv.userId !== user.id) return; // IDOR guard
  }

  await prisma.aIMessage.create({ data: { conversationId: convId, role: "user", content } });

  let reply: string;
  if (!process.env.OPENAI_API_KEY) {
    // Offline fallback: direct tool commands still work without a model.
    const toolMatch = content.match(/^search (clients|cases|documents|payments)\s+(.+)/i);
    if (toolMatch) {
      const map: Record<string, string> = { clients: "searchClients", cases: "searchCases", documents: "searchDocuments", payments: "searchPayments" };
      const result = await runTool(user, map[toolMatch[1].toLowerCase()], toolMatch[2]);
      reply = result.ok
        ? `Tool ${result.tool} results:\n\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``
        : `⚠ ${result.error}`;
    } else {
      reply =
        "JUN AI is not connected to a model yet (OPENAI_API_KEY is not configured). " +
        "You can still use tool commands: `search clients <name>`, `search cases <query>`, `search documents <query>`, `search payments <query>`.";
    }
  } else {
    const { generateText, stepCountIs } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const { buildAITools } = await import("@/lib/ai/tools");
    const history = await prisma.aIMessage.findMany({ where: { conversationId: convId }, orderBy: { createdAt: "asc" }, take: 24 });
    try {
      const result = await generateText({
        model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
        system:
          "You are JUN AI, the internal assistant of JUN CREATIF AND TRAVEL LLC. Be concise and professional. " +
          "Use the provided tools to look up real data instead of guessing. You may create DRAFTS (documents, tasks) via tools, " +
          "but you NEVER finalize documents, never sign, never send emails, never approve payments or refunds — those require human approval. " +
          "Never reveal secrets, tokens, passwords or full identity-document data.",
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

// ── Write with JUN AI: generates a document draft (never signs, never finalizes)
export async function generateDocumentDraft(formData: FormData): Promise<{ content?: string; error?: string }> {
  const user = await assertPermission("DOCUMENT_CREATE");
  const instruction = String(formData.get("instruction") ?? "").trim().slice(0, 2000);
  const clientId = String(formData.get("clientId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!instruction) return { error: "Write an instruction first." };

  // Context the AI receives — only what this user is allowed to read.
  let context = "";
  if (clientId && can(user, "CLIENT_READ")) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { payments: { where: { status: "CONFIRMED" }, take: 10 } },
    });
    if (client) {
      context += `Client: ${client.firstName} ${client.lastName} (${client.internalId}), email ${client.email ?? "n/a"}, country ${client.country ?? "n/a"}.\n`;
      if (can(user, "PAYMENT_READ") && client.payments.length) {
        context += `Confirmed payments: ${client.payments.map((p) => `${p.reference} ${p.currency} ${Number(p.amount)}`).join("; ")}.\n`;
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
      content:
        "You draft professional business documents for JUN CREATIF AND TRAVEL LLC as clean HTML (h1, h2, p, ul, table only — no scripts or styles). " +
        "Include placeholders like [DATE] or [SIGNATURE] where information is missing. Never state that the document is signed; drafts are always unsigned.",
    },
    { role: "user", content: `${context}\nInstruction: ${instruction}\nReturn only the HTML body of the draft.` },
  ]);

  await logActivity({ type: "AI_DRAFT", message: "AI document draft generated", userId: user.id, clientId: clientId || null, caseId: caseId || null });

  if (ai) return { content: ai };
  // Deterministic offline fallback so the workflow is usable without a key.
  return {
    content: `<h1>Draft</h1><p><em>Generated offline (no OPENAI_API_KEY configured). Edit freely.</em></p><p>Instruction: ${instruction.replace(/</g, "&lt;")}</p>${context ? `<p>Context: ${context.replace(/</g, "&lt;")}</p>` : ""}<p>[BODY — complete this draft]</p><p>[DATE] · [SIGNATURE]</p>`,
  };
}

// ── AIAction approval workflow ───────────────────────────────────────────────
export async function proposeAIAction(type: string, payload: Record<string, unknown>, conversationId?: string) {
  const user = await assertPermission("AI_USE");
  const action = await prisma.aIAction.create({
    data: { type, payload: payload as never, proposedById: user.id, conversationId: conversationId ?? null },
  });
  await audit({ userId: user.id, action: "AI_ACTION_PROPOSED", resourceType: "AIAction", resourceId: action.id, after: { type } });
  revalidatePath("/app/ai");
}

export async function reviewAIAction(actionId: string, formData: FormData) {
  const user = await assertPermission("AI_APPROVE");
  const decision = String(formData.get("decision") ?? "");
  if (!["APPROVED", "REJECTED"].includes(decision)) return;
  const action = await prisma.aIAction.findUnique({ where: { id: actionId } });
  if (!action || action.status !== "PROPOSED") return;

  await prisma.aIAction.update({
    where: { id: actionId },
    data: { status: decision as never, reviewedById: user.id, reviewedAt: new Date() },
  });
  await audit({ userId: user.id, action: `AI_ACTION_${decision}`, resourceType: "AIAction", resourceId: actionId });

  // Execution only after human approval.
  if (decision === "APPROVED") {
    try {
      // Executors per action type live here; SEND_EMAIL marks the draft as sent.
      if (action.type === "SEND_EMAIL") {
        const p = action.payload as { messageId?: string };
        if (p.messageId) {
          await prisma.emailMessage.update({ where: { id: p.messageId }, data: { isDraft: false, sentAt: new Date() } });
        }
      }
      await prisma.aIAction.update({ where: { id: actionId }, data: { status: "EXECUTED", executedAt: new Date() } });
    } catch (e) {
      await prisma.aIAction.update({ where: { id: actionId }, data: { status: "FAILED", error: e instanceof Error ? e.message : "Execution failed" } });
    }
  }
  revalidatePath("/app/ai");
}
