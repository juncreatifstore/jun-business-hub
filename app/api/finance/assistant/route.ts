import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getCurrentUser, can } from "@/lib/auth";
import { getFinanceEnterpriseIntelligence, deterministicExecutiveSummary } from "@/lib/finance-enterprise-ai";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, "PAYMENT_READ") || !can(user, "AI_USE")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let question = "Give me an executive finance summary and the top priorities.";
  try {
    const body = await req.json();
    question = String(body?.question || question).trim().slice(0, 1200) || question;
  } catch {}

  const intelligence = await getFinanceEnterpriseIntelligence();
  const fallback = deterministicExecutiveSummary(intelligence);
  const safeSnapshot = {
    generatedAt: intelligence.generatedAt.toISOString(),
    riskScore: intelligence.riskScore,
    riskLevel: intelligence.riskLevel,
    anomalyCounts: {
      total: intelligence.anomalies.length,
      duplicate: intelligence.duplicateCount,
      reconciliation: intelligence.reconciliationCount,
      overdueRefund: intelligence.overdueRefundCount,
      critical: intelligence.anomalies.filter((a) => a.level === "CRITICAL").length,
      high: intelligence.anomalies.filter((a) => a.level === "HIGH").length,
    },
    topAnomalies: intelligence.anomalies.slice(0, 12).map((a) => ({ level: a.level, category: a.category, title: a.title, detail: a.detail })),
    forecast: intelligence.forecast,
    providerAnalytics: intelligence.providerAnalytics.slice(0, 12),
    accounts: { configured: intelligence.configuredAccounts, active: intelligence.activeAccounts },
  };

  if (!process.env.OPENAI_API_KEY) {
    await audit({ userId: user.id, action: "FINANCE_AI_FALLBACK", resourceType: "Finance", after: { question } });
    return NextResponse.json({ answer: fallback, mode: "rules", generatedAt: safeSnapshot.generatedAt });
  }

  try {
    const { text } = await generateText({
      model: openai(process.env.OPENAI_FINANCE_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"),
      system: [
        "You are JUN Finance Assistant, a read-only financial operations analyst.",
        "Use only the supplied sanitized finance snapshot. Do not invent transactions, balances, exchange rates, legal conclusions, or provider confirmations.",
        "Never claim to approve refunds, confirm payments, move money, cancel transactions, or alter records. Those actions require authorized humans.",
        "Keep currencies separate. Never add different currencies into one total unless an explicit conversion rate is supplied (none is supplied here).",
        "Distinguish facts from forecasts. Forecasts are simple projections based on trailing realized cash and scheduled refunds, not guarantees.",
        "Prioritize reconciliation mismatches, possible duplicates, overdue refunds, missing evidence and unusually high fees.",
        "Answer in the language used by the user when practical.",
      ].join(" "),
      prompt: `User question:\n${question}\n\nSanitized finance snapshot:\n${JSON.stringify(safeSnapshot)}`,
    });
    await audit({ userId: user.id, action: "FINANCE_AI_QUERY", resourceType: "Finance", after: { question, riskLevel: intelligence.riskLevel, anomalyCount: intelligence.anomalies.length } });
    return NextResponse.json({ answer: text.trim() || fallback, mode: "ai", generatedAt: safeSnapshot.generatedAt });
  } catch (error) {
    await audit({ userId: user.id, action: "FINANCE_AI_ERROR", resourceType: "Finance", after: { question, error: error instanceof Error ? error.message.slice(0, 300) : "AI error" } });
    return NextResponse.json({ answer: fallback, mode: "rules", generatedAt: safeSnapshot.generatedAt, warning: "AI provider unavailable; rules-based summary shown." });
  }
}
