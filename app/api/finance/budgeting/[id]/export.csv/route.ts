import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth";
import { getBudgetPlan, getBudgetVariance } from "@/lib/finance-budgeting";

export const dynamic = "force-dynamic";
function csv(v: unknown) { const s = String(v ?? ""); return `"${s.replaceAll('"','""')}"`; }

export async function GET(_: Request, { params }: { params: { id: string } }) {
  await assertPermission("BUDGET_READ");
  const plan = await getBudgetPlan(params.id);
  if (!plan) return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  const now = new Date();
  const throughMonth = now.getUTCFullYear() === plan.year ? now.getUTCMonth() : now.getUTCFullYear() > plan.year ? 11 : -1;
  const variance = await getBudgetVariance(plan, throughMonth);
  const rows: string[][] = [["budget","year","currency","category","month","monthly_budget","ytd_budget","ytd_actual","favorable_variance","utilization_percent","status"]];
  for (const line of plan.lines) {
    const v = variance.rows.find((row) => row.category === line.category);
    line.monthly.forEach((amount, month) => rows.push([plan.name,String(plan.year),plan.currency,line.label,String(month+1),String(amount),String(v?.budget??0),String(v?.actual??0),String(v?.favorableVariance??0),v?.utilizationPercent===null?"":String(v?.utilizationPercent??0),v?.status??"ON_TRACK"]));
  }
  const body = rows.map((row) => row.map(csv).join(",")).join("\n");
  return new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="jun-budget-${plan.year}-${plan.currency}.csv"`, "cache-control": "no-store" } });
}
