import { NextRequest, NextResponse } from "next/server";
import { ingestProjectCashflow, type TreasuryDirection } from "@/lib/company-funds";
import { assertFinancialPeriodOpen } from "@/lib/company-funds-monthly-close";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const projectCode = request.headers.get("x-jun-project-code")?.trim() || "";
    const apiKey = request.headers.get("x-jun-project-key")?.trim() || "";
    if (!projectCode || !apiKey) return NextResponse.json({ ok: false, error: "Missing project authentication headers" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const direction = String(body.direction || "").toUpperCase() as TreasuryDirection;
    if (!(["IN","OUT"] as string[]).includes(direction)) return NextResponse.json({ ok: false, error: "direction must be IN or OUT" }, { status: 400 });
    const occurredAt = String(body.occurredAt || new Date().toISOString());
    await assertFinancialPeriodOpen(occurredAt);
    const result = await ingestProjectCashflow({
      projectCode,
      apiKey,
      externalId: String(body.externalId || ""),
      direction,
      category: String(body.category || "OTHER"),
      amount: Number(body.amount || 0),
      currency: String(body.currency || "").toUpperCase(),
      occurredAt,
      description: String(body.description || ""),
      accountId: body.accountId ? String(body.accountId) : null,
    });
    return NextResponse.json({ ok: true, duplicate: result.duplicate, transactionId: result.transaction.id }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project sync failed";
    const status = message.includes("Invalid project API key") || message.includes("Unknown project integration") ? 401 : message.includes("Financial period is closed") ? 423 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
