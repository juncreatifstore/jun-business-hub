import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { buildMonthlyReport, monthlyReportCsv } from "@/lib/finance-monthly";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role === "CLIENT" || !can(user, "PAYMENT_READ"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const r = await buildMonthlyReport(req.nextUrl.searchParams.get("month") ?? undefined);
  const body = "\uFEFF" + monthlyReportCsv(r);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport-mensuel-${r.key}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
