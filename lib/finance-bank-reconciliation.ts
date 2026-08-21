import "server-only";
import { createHash, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { listJournalEntries, type JournalEntry } from "@/lib/finance-accounting";

const IMPORT_PREFIX = "finance.bank.import.";
const TX_PREFIX = "finance.bank.transaction.";
const MATCH_PREFIX = "finance.bank.match.";
const CLOSE_PREFIX = "finance.bank.close.";

export type BankTransactionStatus = "UNMATCHED" | "SUGGESTED" | "MATCHED" | "IGNORED";
export type BankStatementImport = {
  id:string; fileName:string; format:"CSV"|"OFX"; bankName:string; accountLabel:string; accountLast4:string;
  currency:string; periodStart:string|null; periodEnd:string|null; transactionCount:number; duplicateCount:number;
  fileHash:string; importedById:string; importedAt:string;
};
export type BankTransaction = {
  id:string; importId:string; date:string; postedDate:string|null; amount:number; currency:string; description:string;
  bankReference:string; fingerprint:string; status:BankTransactionStatus; suggestedEntryId:string|null; suggestedScore:number|null;
  createdAt:string;
};
export type ReconciliationMatch = {
  id:string; transactionId:string; journalEntryId:string; amountDifference:number; dayDifference:number;
  method:"AUTO_SUGGESTED"|"MANUAL"; note:string; matchedById:string; matchedAt:string;
};
export type BankPeriodClose = { period:string; currency:string; accountLabel:string; closedAt:string; closedById:string; note:string };

function round(v:number){return Math.round(v*100)/100;}
function sha(value:string){return createHash("sha256").update(value).digest("hex");}
function normalize(s:string){return String(s||"").trim().replace(/\s+/g," ");}
function parseDate(value:string){const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function bankFingerprint(tx:{date:string;amount:number;currency:string;description:string;bankReference:string}){
  return sha([tx.date.slice(0,10),round(tx.amount).toFixed(2),tx.currency.toUpperCase(),normalize(tx.description).toUpperCase(),normalize(tx.bankReference).toUpperCase()].join("|"));
}
function csvCells(line:string){const out:string[]=[];let cur="",quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++;}else quoted=!quoted;}else if(ch===","&&!quoted){out.push(cur.trim());cur="";}else cur+=ch;}out.push(cur.trim());return out;}
function findColumn(headers:string[], aliases:string[]){const normalized=headers.map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,""));return normalized.findIndex(h=>aliases.includes(h));}

export function parseBankCsv(text:string,currency:string){
  const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)throw new Error("CSV has no transaction rows");
  const headers=csvCells(lines[0]);
  const dateCol=findColumn(headers,["date","transactiondate","posteddate","postingdate"]);
  const descCol=findColumn(headers,["description","memo","details","name","narrative"]);
  const amountCol=findColumn(headers,["amount","transactionamount"]);
  const debitCol=findColumn(headers,["debit","withdrawal","withdrawals"]);
  const creditCol=findColumn(headers,["credit","deposit","deposits"]);
  const refCol=findColumn(headers,["reference","ref","transactionid","id","checknumber"]);
  if(dateCol<0||descCol<0||(amountCol<0&&debitCol<0&&creditCol<0))throw new Error("CSV must contain date, description and amount (or debit/credit) columns");
  return lines.slice(1).map((line,index)=>{const c=csvCells(line);const d=parseDate(c[dateCol]);if(!d)return null;let amount=0;if(amountCol>=0)amount=Number(String(c[amountCol]||"").replace(/[^0-9.-]/g,""));else{const debit=Number(String(c[debitCol]||"").replace(/[^0-9.-]/g,""))||0;const credit=Number(String(c[creditCol]||"").replace(/[^0-9.-]/g,""))||0;amount=credit-Math.abs(debit);}if(!Number.isFinite(amount)||amount===0)return null;return{date:d.toISOString(),postedDate:null,amount:round(amount),currency:currency.toUpperCase(),description:normalize(c[descCol]),bankReference:refCol>=0?normalize(c[refCol]):`ROW-${index+2}`};}).filter((v):v is NonNullable<typeof v>=>Boolean(v));
}

function ofxTag(block:string,tag:string){return block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`,"i"))?.[1]?.trim()||"";}
function ofxDate(value:string){const raw=value.replace(/[^0-9]/g,"").slice(0,14);if(raw.length<8)return null;const iso=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}T${raw.slice(8,10)||"00"}:${raw.slice(10,12)||"00"}:${raw.slice(12,14)||"00"}Z`;return parseDate(iso);}
export function parseBankOfx(text:string,currencyFallback:string){
  const currency=(ofxTag(text,"CURDEF")||currencyFallback||"USD").toUpperCase();const blocks=text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)||[];
  const rows=blocks.map((b,index)=>{const d=ofxDate(ofxTag(b,"DTPOSTED"));const amount=Number(ofxTag(b,"TRNAMT"));if(!d||!Number.isFinite(amount)||amount===0)return null;return{date:d.toISOString(),postedDate:d.toISOString(),amount:round(amount),currency,description:normalize([ofxTag(b,"NAME"),ofxTag(b,"MEMO")].filter(Boolean).join(" · ")),bankReference:normalize(ofxTag(b,"FITID")||ofxTag(b,"CHECKNUM")||`OFX-${index+1}`)};}).filter((v):v is NonNullable<typeof v>=>Boolean(v));
  if(!rows.length)throw new Error("No OFX transactions found");return rows;
}

export async function importBankStatement(input:{fileName:string;content:string;format:"CSV"|"OFX";bankName:string;accountLabel:string;accountLast4:string;currency:string;importedById:string}){
  const rows=input.format==="OFX"?parseBankOfx(input.content,input.currency):parseBankCsv(input.content,input.currency);const fileHash=sha(input.content);
  const existing=await prisma.appSetting.findFirst({where:{key:{startsWith:IMPORT_PREFIX},value:{contains:fileHash}},select:{key:true}});if(existing)throw new Error("This statement file appears to have already been imported");
  const existingTx=await prisma.appSetting.findMany({where:{key:{startsWith:TX_PREFIX}},select:{value:true}});const fingerprints=new Set(existingTx.map(r=>{try{return (JSON.parse(r.value) as BankTransaction).fingerprint}catch{return""}}));
  const id=randomUUID();let duplicates=0;const saved:BankTransaction[]=[];
  for(const row of rows){const fingerprint=bankFingerprint(row);if(fingerprints.has(fingerprint)){duplicates++;continue;}fingerprints.add(fingerprint);const tx:BankTransaction={id:randomUUID(),importId:id,...row,fingerprint,status:"UNMATCHED",suggestedEntryId:null,suggestedScore:null,createdAt:new Date().toISOString()};await prisma.appSetting.create({data:{key:`${TX_PREFIX}${tx.id}`,value:JSON.stringify(tx)}});saved.push(tx);}
  const dates=saved.map(t=>new Date(t.date).getTime()).filter(Number.isFinite);const record:BankStatementImport={id,fileName:input.fileName,format:input.format,bankName:normalize(input.bankName),accountLabel:normalize(input.accountLabel),accountLast4:normalize(input.accountLast4).slice(-4),currency:input.currency.toUpperCase(),periodStart:dates.length?new Date(Math.min(...dates)).toISOString():null,periodEnd:dates.length?new Date(Math.max(...dates)).toISOString():null,transactionCount:saved.length,duplicateCount:duplicates,fileHash,importedById:input.importedById,importedAt:new Date().toISOString()};
  await prisma.appSetting.create({data:{key:`${IMPORT_PREFIX}${id}`,value:JSON.stringify(record)}});await suggestMatchesForImport(id);return record;
}

export async function listStatementImports(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:IMPORT_PREFIX}},orderBy:{updatedAt:"desc"},take:200,select:{value:true}});return rows.map(r=>{try{return JSON.parse(r.value) as BankStatementImport}catch{return null}}).filter((v):v is BankStatementImport=>Boolean(v?.id));}
export async function getStatementImport(id:string){const row=await prisma.appSetting.findUnique({where:{key:`${IMPORT_PREFIX}${id}`},select:{value:true}});if(!row)return null;try{return JSON.parse(row.value) as BankStatementImport}catch{return null}}
export async function listBankTransactions(importId?:string){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:TX_PREFIX}},orderBy:{updatedAt:"desc"},take:5000,select:{value:true}});return rows.map(r=>{try{return JSON.parse(r.value) as BankTransaction}catch{return null}}).filter((v):v is BankTransaction=>Boolean(v?.id)&&(!importId||v.importId===importId));}
export async function getBankTransaction(id:string){const row=await prisma.appSetting.findUnique({where:{key:`${TX_PREFIX}${id}`},select:{value:true}});if(!row)return null;try{return JSON.parse(row.value) as BankTransaction}catch{return null}}
export async function listReconciliationMatches(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:MATCH_PREFIX}},orderBy:{updatedAt:"desc"},take:5000,select:{value:true}});return rows.map(r=>{try{return JSON.parse(r.value) as ReconciliationMatch}catch{return null}}).filter((v):v is ReconciliationMatch=>Boolean(v?.id));}
function cashMovement(entry:JournalEntry){return round(entry.lines.filter(l=>l.accountCode==="1000").reduce((s,l)=>s+l.debit-l.credit,0));}
function dayDiff(a:string,b:string){return Math.abs(Math.round((new Date(a).getTime()-new Date(b).getTime())/86400000));}
function matchScore(tx:BankTransaction,e:JournalEntry){if(tx.currency!==e.currency)return 0;const diff=Math.abs(round(tx.amount-cashMovement(e)));if(diff>0.01)return 0;const days=dayDiff(tx.date,e.date);if(days>5)return 0;let score=100-days*10;const text=`${e.description} ${e.sourceId}`.toUpperCase();if(tx.bankReference&&text.includes(tx.bankReference.toUpperCase()))score+=20;return Math.min(100,Math.max(1,score));}
export async function suggestMatchesForImport(importId:string){const txs=await listBankTransactions(importId);const entries=await listJournalEntries(5000);const matches=await listReconciliationMatches();const used=new Set(matches.map(m=>m.journalEntryId));let suggested=0;for(const tx of txs){if(tx.status==="MATCHED"||tx.status==="IGNORED")continue;const candidates=entries.filter(e=>!used.has(e.id)).map(e=>({e,score:matchScore(tx,e)})).filter(x=>x.score>=60).sort((a,b)=>b.score-a.score);const best=candidates[0];const next={...tx,status:best?"SUGGESTED" as const:"UNMATCHED" as const,suggestedEntryId:best?.e.id||null,suggestedScore:best?.score||null};await prisma.appSetting.update({where:{key:`${TX_PREFIX}${tx.id}`},data:{value:JSON.stringify(next)}});if(best)suggested++;}return suggested;}

export async function confirmReconciliation(transactionId:string,journalEntryId:string,userId:string,note:string,method:"AUTO_SUGGESTED"|"MANUAL"="MANUAL"){
  const tx=await getBankTransaction(transactionId);if(!tx)throw new Error("Bank transaction not found");if(tx.status==="MATCHED")throw new Error("Transaction is already reconciled");
  const entry=(await listJournalEntries(5000)).find(e=>e.id===journalEntryId);if(!entry)throw new Error("Journal entry not found");if(entry.currency!==tx.currency)throw new Error("Currency mismatch");const amountDifference=round(tx.amount-cashMovement(entry));if(Math.abs(amountDifference)>0.01)throw new Error("Amount mismatch exceeds reconciliation tolerance");
  const existingMatches=await listReconciliationMatches();if(existingMatches.some(m=>m.journalEntryId===entry.id))throw new Error("Journal entry is already reconciled");
  const match:ReconciliationMatch={id:randomUUID(),transactionId:tx.id,journalEntryId:entry.id,amountDifference,dayDifference:dayDiff(tx.date,entry.date),method,note:normalize(note).slice(0,500),matchedById:userId,matchedAt:new Date().toISOString()};
  await prisma.appSetting.create({data:{key:`${MATCH_PREFIX}${match.id}`,value:JSON.stringify(match)}});await prisma.appSetting.update({where:{key:`${TX_PREFIX}${tx.id}`},data:{value:JSON.stringify({...tx,status:"MATCHED",suggestedEntryId:entry.id,suggestedScore:100})}});return match;
}
export async function ignoreBankTransaction(id:string){const tx=await getBankTransaction(id);if(!tx)throw new Error("Bank transaction not found");if(tx.status==="MATCHED")throw new Error("Matched transaction cannot be ignored");await prisma.appSetting.update({where:{key:`${TX_PREFIX}${id}`},data:{value:JSON.stringify({...tx,status:"IGNORED",suggestedEntryId:null,suggestedScore:null})}});}
export async function closeBankReconciliationPeriod(input:{period:string;currency:string;accountLabel:string;closedById:string;note:string}){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period))throw new Error("Invalid period");const txs=await listBankTransactions();const imports=await listStatementImports();const importIds=new Set(imports.filter(i=>i.accountLabel===input.accountLabel&&i.currency===input.currency.toUpperCase()).map(i=>i.id));const pending=txs.filter(t=>importIds.has(t.importId)&&t.date.startsWith(input.period)&&!["MATCHED","IGNORED"].includes(t.status));if(pending.length)throw new Error(`${pending.length} bank transaction(s) remain unreconciled`);const key=`${CLOSE_PREFIX}${input.period}.${sha(input.accountLabel).slice(0,12)}.${input.currency.toUpperCase()}`;if(await prisma.appSetting.findUnique({where:{key},select:{key:true}}))throw new Error("This reconciliation period is already closed");const close:BankPeriodClose={period:input.period,currency:input.currency.toUpperCase(),accountLabel:input.accountLabel,closedAt:new Date().toISOString(),closedById:input.closedById,note:normalize(input.note).slice(0,500)};await prisma.appSetting.create({data:{key,value:JSON.stringify(close)}});return close;}
export async function listBankPeriodCloses(){const rows=await prisma.appSetting.findMany({where:{key:{startsWith:CLOSE_PREFIX}},orderBy:{updatedAt:"desc"},select:{value:true}});return rows.map(r=>{try{return JSON.parse(r.value) as BankPeriodClose}catch{return null}}).filter((v):v is BankPeriodClose=>Boolean(v?.period));}
