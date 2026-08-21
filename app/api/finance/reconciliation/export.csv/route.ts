import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth";
import { listBankTransactions, listReconciliationMatches, listStatementImports } from "@/lib/finance-bank-reconciliation";
import { listJournalEntries } from "@/lib/finance-accounting";

export const dynamic="force-dynamic";
function csv(v:unknown){const s=String(v??"");return `"${s.replaceAll('"','""')}"`;}
function cashMovement(lines:{accountCode:string;debit:number;credit:number}[]){return Math.round(lines.filter(l=>l.accountCode==="1000").reduce((s,l)=>s+l.debit-l.credit,0)*100)/100;}

export async function GET(){
  await assertPermission("BANK_RECON_READ");
  const [imports,transactions,matches,entries]=await Promise.all([listStatementImports(),listBankTransactions(),listReconciliationMatches(),listJournalEntries(5000)]);
  const importMap=new Map(imports.map(i=>[i.id,i]));const matchMap=new Map(matches.map(m=>[m.transactionId,m]));const entryMap=new Map(entries.map(e=>[e.id,e]));
  const rows=[["bank","account_label","account_last4","bank_date","currency","bank_amount","bank_description","bank_reference","status","match_method","journal_entry","journal_date","journal_description","ledger_cash_amount","amount_difference","day_difference","matched_at"]];
  for(const tx of transactions){const imp=importMap.get(tx.importId);const match=matchMap.get(tx.id);const entry=match?entryMap.get(match.journalEntryId):undefined;rows.push([imp?.bankName||"",imp?.accountLabel||"",imp?.accountLast4||"",tx.date,tx.currency,String(tx.amount),tx.description,tx.bankReference,tx.status,match?.method||"",entry?.entryNumber||"",entry?.date||"",entry?.description||"",entry?String(cashMovement(entry.lines)):"",match?String(match.amountDifference):"",match?String(match.dayDifference):"",match?.matchedAt||""]);}
  const body=rows.map(r=>r.map(csv).join(",")).join("\n");
  return new NextResponse(body,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="jun-bank-reconciliation-${new Date().toISOString().slice(0,10)}.csv"`,`cache-control`:"no-store"}});
}
