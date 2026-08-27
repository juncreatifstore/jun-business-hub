import { NextRequest, NextResponse } from "next/server";
import { ingestTreasuryAccountSync } from "@/lib/company-funds";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const accountId = request.headers.get("x-jun-account-id")?.trim() || "";
    const apiKey = request.headers.get("x-jun-account-key")?.trim() || "";
    if (!accountId || !apiKey) return NextResponse.json({ ok: false, error: "Missing account authentication headers" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const result = await ingestTreasuryAccountSync({
      accountId,
      apiKey,
      externalId: String(body.externalId || ""),
      balance: Number(body.balance || 0),
      currency: String(body.currency || "").toUpperCase(),
      capturedAt: body.capturedAt ? String(body.capturedAt) : null,
      note: body.note ? String(body.note) : "",
    });
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      snapshotId: result.snapshot.id,
      reconciliation: result.reconciliation ? {
        id: result.reconciliation.id,
        status: result.reconciliation.status,
        expectedBalance: result.reconciliation.expectedBalance,
        reportedBalance: result.reconciliation.reportedBalance,
        difference: result.reconciliation.difference,
      } : null,
    }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account sync failed";
    const status = message.includes("Invalid account API key") || message.includes("Unknown treasury account") || message.includes("not configured") ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
