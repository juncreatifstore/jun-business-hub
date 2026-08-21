import { NextRequest, NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth";
import { getAccountingStatements } from "@/lib/finance-accounting";

export const dynamic="force-dynamic";
function csv(v:unknown){const s=String(v??"");return `"${s.replaceAll('"','""')}"`;}
function parseDate(v:string|null,end=false){if(v&&/^\d{4}-\d{2}-\d{2}$/.test(v))return new Date(`${v}T${end?"23:59:59.999":"00:00:00"}`);const n=new Date();return end?new Date(n.getFullYear(),n.getMonth()+1,0,23,59,59,999):new Date(n.getFullYear(),n.getMonth(),1);}

export async function GET(req:NextRequest){
  await assertPermission("ACCOUNTING_READ");
  const from=parseDate(req.nextUrl.searchParams.get("from"));
  const to=parseDate(req.nextUrl.searchParams.get("to"),true);
  const data=await getAccountingStatements(from,to);
  const rows=[["entry_number","date","currency","description","source_type","source_id","account_code","account_name","debit","credit","entry_hash"]];
  for(const e of data.entries)for(const l of e.lines)rows.push([e.entryNumber,e.date,e.currency,e.description,e.sourceType,e.sourceId,l.accountCode,l.accountName,String(l.debit),String(l.credit),e.hash]);
  const body=rows.map(r=>r.map(csv).join(",")).join("\n");
  const name=`jun-accounting-${from.toISOString().slice(0,10)}-${to.toISOString().slice(0,10)}.csv`;
  return new NextResponse(body,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${name}"`,"cache-control":"no-store"}});
}
