import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildCompanyFinanceEntries, type ConsolidatedFinanceEntry } from "@/lib/company-funds-finance-sync";
import { listBankTransactions, listStatementImports, type BankTransaction } from "@/lib/finance-bank-reconciliation";
import { getTreasuryStore } from "@/lib/company-funds";

const MATCH_PREFIX="company.funds.txrecon.match.";
const IGNORE_PREFIX="company.funds.txrecon.ignore.";

export type TreasuryTransactionMatch={
  id:string; financeEntryId:string; bankTransactionId:string; treasuryAccountId:string|null;
  score:number; amountDifference:number; dayDifference:number; method:"AUTO"|"MANUAL";
  note:string; matchedById:string; matchedAt:string;
};
export type TreasuryTransactionIgnore={id:string; bankTransactionId:string; reason:string; ignoredById:string; ignoredAt:string};
export type TreasuryTransactionCandidate={bank:BankTransaction;finance:ConsolidatedFinanceEntry;score:number;amountDifference:number;dayDifference:number};

function round(v:number){return Math.round((v+Number.EPSILON)*100)/100}
function dayDiff(a:string,b:string){return Math.abs(Math.round((new Date(a).getTime()-new Date(b).getTime())/86400000))}
function norm(v:string){return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
function expectedBankAmount(e:ConsolidatedFinanceEntry){return e.direction==="IN"?round(e.amount):round(-e.amount)}

async function listMatches(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:MATCH_PREFIX}},orderBy:{updatedAt:"desc"},take:10000,select:{value:true}});const out:TreasuryTransactionMatch[]=[];for(const r of rows)try{const v=JSON.parse(r.value) as TreasuryTransactionMatch;if(v?.id)out.push(v)}catch{}return out}
async function listIgnores(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:IGNORE_PREFIX}},orderBy:{updatedAt:"desc"},take:10000,select:{value:true}});const out:TreasuryTransactionIgnore[]=[];for(const r of rows)try{const v=JSON.parse(r.value) as TreasuryTransactionIgnore;if(v?.id)out.push(v)}catch{}return out}

function scoreCandidate(bank:BankTransaction,finance:ConsolidatedFinanceEntry,accountImportIds:Set<string>){
  if(bank.currency!==finance.currency)return null;
  if(finance.treasuryAccountId&&accountImportIds.size&&!accountImportIds.has(bank.importId))return null;
  const amountDifference=round(bank.amount-expectedBankAmount(finance));
  if(Math.abs(amountDifference)>Math.max(.01,finance.amount*.02))return null;
  const days=dayDiff(bank.date,finance.occurredAt);if(days>7)return null;
  let score=100-Math.min(50,days*7)-Math.min(25,Math.round(Math.abs(amountDifference)*10));
  const hay=norm(`${bank.description} ${bank.bankReference}`);const needles=[finance.reference,finance.sourceId].map(norm).filter(Boolean);
  if(needles.some(n=>n.length>=4&&hay.includes(n)))score+=20;
  if(Math.abs(amountDifference)<.01)score+=10;
  return {score:Math.max(1,Math.min(100,score)),amountDifference,dayDifference:days};
}

export async function getTreasuryTransactionReconciliation(){
  const [financeEntries,bankTransactions,imports,treasury,matches,ignores]=await Promise.all([buildCompanyFinanceEntries(),listBankTransactions(),listStatementImports(),getTreasuryStore(),listMatches(),listIgnores()]);
  const matchedFinance=new Set(matches.map(m=>m.financeEntryId));const matchedBank=new Set(matches.map(m=>m.bankTransactionId));const ignoredBank=new Set(ignores.map(i=>i.bankTransactionId));
  const importMap=new Map(imports.map(i=>[i.id,i]));
  const accountImportIds=new Map<string,Set<string>>();
  for(const account of treasury.accounts){const set=new Set<string>();for(const imp of imports){const label=norm(`${imp.bankName} ${imp.accountLabel} ${imp.accountLast4}`);const accountText=norm(`${account.institution} ${account.name} ${account.externalRef}`);if(account.currency===imp.currency&&accountText&&label&&(label.includes(accountText)||accountText.includes(label)||account.externalRef&&label.includes(norm(account.externalRef))))set.add(imp.id)}accountImportIds.set(account.id,set)}
  const openFinance=financeEntries.filter(e=>!matchedFinance.has(e.id));
  const openBank=bankTransactions.filter(b=>!matchedBank.has(b.id)&&!ignoredBank.has(b.id)&&!["IGNORED"].includes(b.status));
  const suggestions:TreasuryTransactionCandidate[]=[];
  for(const b of openBank){let best:TreasuryTransactionCandidate|null=null;for(const f of openFinance){const accountIds=f.treasuryAccountId?accountImportIds.get(f.treasuryAccountId)||new Set<string>():new Set<string>();const s=scoreCandidate(b,f,accountIds);if(!s)continue;const c={bank:b,finance:f,...s};if(!best||c.score>best.score)best=c}if(best&&best.score>=60)suggestions.push(best)}
  const suggestedFinance=new Set(suggestions.map(s=>s.finance.id));const suggestedBank=new Set(suggestions.map(s=>s.bank.id));
  const duplicateGroups=new Map<string,BankTransaction[]>();for(const b of openBank){const key=`${b.currency}|${round(b.amount)}|${b.date.slice(0,10)}`;const arr=duplicateGroups.get(key)||[];arr.push(b);duplicateGroups.set(key,arr)}
  const possibleDuplicates=[...duplicateGroups.values()].filter(g=>g.length>1);
  const unexplainedBank=openBank.filter(b=>!suggestedBank.has(b.id));
  const missingInBank=openFinance.filter(f=>!suggestedFinance.has(f.id));
  const unexpectedFees=openBank.filter(b=>b.amount<0&&/FEE|COMMISSION|CHARGE|FRAIS|COMISION/i.test(`${b.description} ${b.bankReference}`)&&!suggestedBank.has(b.id));
  const byAccount=treasury.accounts.map(a=>{const importIds=accountImportIds.get(a.id)||new Set<string>();const txs=bankTransactions.filter(b=>importIds.has(b.importId));const linked=matches.filter(m=>m.treasuryAccountId===a.id);return{account:a,statementTransactions:txs.length,matched:linked.length,unmatched:txs.filter(b=>!matchedBank.has(b.id)&&!ignoredBank.has(b.id)).length,importCount:importIds.size}});
  return{financeEntries,bankTransactions,imports,importMap,accountImportIds,matches,ignores,suggestions:suggestions.sort((a,b)=>b.score-a.score),possibleDuplicates,unexplainedBank,missingInBank,unexpectedFees,byAccount,summary:{financeTotal:financeEntries.length,bankTotal:bankTransactions.length,matched:matches.length,suggested:suggestions.length,unexplainedBank:unexplainedBank.length,missingInBank:missingInBank.length,duplicates:possibleDuplicates.reduce((s,g)=>s+g.length,0),unexpectedFees:unexpectedFees.length}};
}

export async function confirmTreasuryTransactionMatch(input:{financeEntryId:string;bankTransactionId:string;userId:string;note?:string;method?:"AUTO"|"MANUAL"}){
  const data=await getTreasuryTransactionReconciliation();
  if(data.matches.some(m=>m.financeEntryId===input.financeEntryId))throw new Error("Cette opération Finance est déjà rapprochée");
  if(data.matches.some(m=>m.bankTransactionId===input.bankTransactionId))throw new Error("Cette transaction bancaire est déjà rapprochée");
  const finance=data.financeEntries.find(e=>e.id===input.financeEntryId);const bank=data.bankTransactions.find(b=>b.id===input.bankTransactionId);if(!finance||!bank)throw new Error("Transaction introuvable");
  if(finance.currency!==bank.currency)throw new Error("Devise incompatible");
  const amountDifference=round(bank.amount-expectedBankAmount(finance));if(Math.abs(amountDifference)>Math.max(.01,finance.amount*.02))throw new Error("Écart de montant trop important");
  const match:TreasuryTransactionMatch={id:randomUUID(),financeEntryId:finance.id,bankTransactionId:bank.id,treasuryAccountId:finance.treasuryAccountId,score:100,amountDifference,dayDifference:dayDiff(bank.date,finance.occurredAt),method:input.method||"MANUAL",note:String(input.note||"").trim().slice(0,500),matchedById:input.userId,matchedAt:new Date().toISOString()};
  await prisma.appSetting.create({data:{key:`${MATCH_PREFIX}${match.id}`,value:JSON.stringify(match)}});return match;
}
export async function ignoreTreasuryBankTransaction(input:{bankTransactionId:string;reason:string;userId:string}){const data=await getTreasuryTransactionReconciliation();if(data.matches.some(m=>m.bankTransactionId===input.bankTransactionId))throw new Error("Une transaction rapprochée ne peut pas être ignorée");const row:TreasuryTransactionIgnore={id:randomUUID(),bankTransactionId:input.bankTransactionId,reason:String(input.reason||"").trim().slice(0,500)||"Hors opérations JUN",ignoredById:input.userId,ignoredAt:new Date().toISOString()};await prisma.appSetting.upsert({where:{key:`${IGNORE_PREFIX}${input.bankTransactionId}`},create:{key:`${IGNORE_PREFIX}${input.bankTransactionId}`,value:JSON.stringify(row)},update:{value:JSON.stringify(row)}});return row}
