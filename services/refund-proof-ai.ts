"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit, logActivity } from "@/lib/audit";

export type RefundProofCandidate = {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  score: number;
  reason: string;
  caseLabel: string | null;
  paymentReference: string | null;
};

function daysBetween(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function baseScore(input: {
  category: string;
  name: string;
  createdAt: Date;
  refundCreatedAt: Date;
  sameCase: boolean;
  samePayment: boolean;
  refundNumber: string;
  paymentReference?: string | null;
  amount: number;
}) {
  let score = 0;
  const reasons: string[] = [];
  const name = input.name.toLowerCase();

  if (input.samePayment) { score += 45; reasons.push("linked to the original payment"); }
  if (input.sameCase) { score += 20; reasons.push("same case/service"); }
  if (["PAYMENT_PROOF", "RECEIPT", "REFUND"].includes(input.category)) { score += 20; reasons.push(`category ${input.category}`); }
  if (/proof|receipt|reçu|recibo|deposit|dépôt|depot|payment|paiement|transfer|transfert|bank|banque|sogebank|zelle|paypal|stripe/i.test(name)) { score += 15; reasons.push("filename suggests payment evidence"); }
  if (input.paymentReference && name.includes(input.paymentReference.toLowerCase())) { score += 35; reasons.push("payment reference found in filename"); }
  if (name.includes(input.refundNumber.toLowerCase())) { score += 30; reasons.push("refund reference found in filename"); }
  const compactAmount = String(input.amount).replace(/\.00$/, "");
  if (compactAmount && name.replace(/[, ]/g, "").includes(compactAmount.replace(/[, ]/g, ""))) { score += 10; reasons.push("amount may appear in filename"); }
  const days = daysBetween(input.createdAt, input.refundCreatedAt);
  if (days <= 3) { score += 12; reasons.push("date very close to refund request"); }
  else if (days <= 14) { score += 7; reasons.push("date close to refund request"); }
  else if (days <= 60) { score += 3; reasons.push("date reasonably close"); }

  return { score: Math.min(100, score), reasons };
}

async function aiRerank(context: string, candidates: RefundProofCandidate[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || candidates.length === 0) return candidates;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You rank existing client-drive files as possible proof for a refund. Never invent files. Return JSON only: {\"ranking\":[{\"id\":\"...\",\"score\":0-100,\"reason\":\"short reason\"}]}. Use only supplied ids." },
          { role: "user", content: `${context}\nCandidates:\n${JSON.stringify(candidates)}` },
        ],
      }),
    });
    if (!res.ok) return candidates;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const rows = Array.isArray(parsed.ranking) ? parsed.ranking : [];
    const map = new Map(rows.map((x: any) => [String(x.id), x]));
    return candidates.map((c) => {
      const hit: any = map.get(c.id);
      if (!hit) return c;
      const aiScore = Math.max(0, Math.min(100, Number(hit.score) || 0));
      return { ...c, score: Math.round((c.score * 0.45) + (aiScore * 0.55)), reason: String(hit.reason || c.reason).slice(0, 180) };
    }).sort((a, b) => b.score - a.score);
  } catch {
    return candidates;
  }
}

export async function findRefundProofCandidates(refundId: string): Promise<{ candidates?: RefundProofCandidate[]; error?: string }> {
  await assertPermission("REFUND_READ");
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      client: { select: { firstName: true, lastName: true, internalId: true } },
      case: { select: { id: true, caseNumber: true, title: true } },
      payment: { select: { id: true, reference: true, amount: true, currency: true, paidAt: true, createdAt: true } },
    },
  });
  if (!refund) return { error: "Refund not found." };

  const files = await prisma.file.findMany({
    where: {
      clientId: refund.clientId,
      archivedAt: null,
      isVault: false,
      OR: [
        { refundId: null },
        { refundId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 120,
    include: {
      case: { select: { caseNumber: true, title: true } },
      payment: { select: { reference: true } },
    },
  });

  const raw = files.map((file) => {
    const ranked = baseScore({
      category: file.category,
      name: file.name,
      createdAt: file.createdAt,
      refundCreatedAt: refund.createdAt,
      sameCase: Boolean(refund.caseId && file.caseId === refund.caseId),
      samePayment: Boolean(refund.paymentId && file.paymentId === refund.paymentId),
      refundNumber: refund.refundNumber,
      paymentReference: refund.payment?.reference,
      amount: Number(refund.amount),
    });
    return {
      id: file.id,
      name: file.name,
      category: file.category,
      createdAt: file.createdAt.toISOString(),
      score: ranked.score,
      reason: ranked.reasons.join(" · ") || "same client drive",
      caseLabel: file.case ? `${file.case.caseNumber} · ${file.case.title}` : null,
      paymentReference: file.payment?.reference ?? null,
    } satisfies RefundProofCandidate;
  }).filter((x) => x.score >= 10).sort((a, b) => b.score - a.score).slice(0, 12);

  const context = `Refund ${refund.refundNumber}; client ${refund.client.firstName} ${refund.client.lastName} (${refund.client.internalId}); amount ${refund.currency} ${Number(refund.amount).toFixed(2)}; reason: ${refund.reason}; original payment ${refund.payment?.reference ?? "unlinked"}; case ${refund.case ? `${refund.case.caseNumber} ${refund.case.title}` : "none"}.`;
  const candidates = await aiRerank(context, raw);
  return { candidates };
}

export async function attachExistingDriveFileToRefund(refundId: string, fileId: string): Promise<{ ok?: true; error?: string }> {
  const user = await assertPermission("REFUND_CREATE");
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, select: { id: true, clientId: true, caseId: true, refundNumber: true } });
  if (!refund) return { error: "Refund not found." };
  const file = await prisma.file.findUnique({ where: { id: fileId }, select: { id: true, name: true, clientId: true, refundId: true, archivedAt: true } });
  if (!file || file.archivedAt) return { error: "Drive file not found or archived." };
  if (file.clientId !== refund.clientId) return { error: "This file belongs to a different client." };
  if (file.refundId && file.refundId !== refundId) return { error: "This file is already attached to another refund." };

  await prisma.file.update({ where: { id: fileId }, data: { refundId, ...(refund.caseId ? { caseId: refund.caseId } : {}) } });
  await audit({ userId: user.id, action: "REFUND_PROOF_AI_ATTACH", resourceType: "Refund", resourceId: refundId, after: { fileId, fileName: file.name } });
  await logActivity({ type: "REFUND_UPDATED", message: `Existing Drive proof attached to ${refund.refundNumber}: ${file.name}`, userId: user.id, clientId: refund.clientId, caseId: refund.caseId });
  revalidatePath(`/app/finance/refunds/${refundId}`);
  return { ok: true };
}
