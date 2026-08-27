import "server-only";
import { getTreasuryStore } from "@/lib/company-funds";
import { getFinancialReserveDashboard } from "@/lib/company-funds-reserves";
import { listFinancialAuthorizations } from "@/lib/company-funds-approvals";
import { listFinancialExecutionEvidence } from "@/lib/company-funds-execution-evidence";
import { listTreasuryTransfers } from "@/lib/company-funds-transfers";
import { listBankTransactions } from "@/lib/finance-bank-reconciliation";

export type MonthlyCloseCheckSeverity="BLOCKING"|"WARNING"|"OK";
export type MonthlyCloseCheck={code:string;label:string;severity:MonthlyCloseCheckSeverity;count:number;detail:string};
export type MonthlyCloseValidation={period:string;canClose:boolean;blockingCount:number;warningCount:number;checks:MonthlyCloseCheck[]};

function bounds(period:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error("Invalid closing period");const [y,m]=period.split("-").map(Number);return{start:new Date(Date.UTC(y,m-1,1)),end:new Date(Date.UTC(y,m,1))}}
function inPeriod(value:string|null|undefined,start:Date,end:Date){if(!value)return false;const t=new Date(value).getTime();return Number.isFinite(t)&&t>=start.getTime()&&t<end.getTime()}
function beforeEnd(value:string|null|undefined,end:Date){if(!value)return false;const t=new Date(value).getTime();return Number.isFinite(t)&&t<end.getTime()}

export async function validateFinancialMonthClose(period:string):Promise<MonthlyCloseValidation>{
  const {start,end}=bounds(period);
  const [treasury,reserves,authorizations,evidence,transfers,bankTransactions]=await Promise.all([
    getTreasuryStore(),getFinancialReserveDashboard(),listFinancialAuthorizations(5000),listFinancialExecutionEvidence(5000),listTreasuryTransfers(),listBankTransactions()
  ]);
  const evidenceAuthIds=new Set(evidence.map(e=>e.authorizationId));

  const unreconciled=bankTransactions.filter(t=>inPeriod(t.date,start,end)&&!["MATCHED","IGNORED"].includes(t.status));
  const pendingAuthorizations=authorizations.filter(a=>a.status==="PENDING"&&beforeEnd(a.createdAt,end));
  const approvedWithoutEvidence=authorizations.filter(a=>a.status==="APPROVED"&&inPeriod(a.approvedAt||a.createdAt,start,end)&&!evidenceAuthIds.has(a.id));
  const inTransit=transfers.filter(t=>["INITIATED","IN_TRANSIT"].includes(t.status)&&beforeEnd(t.initiatedAt||t.createdAt,end));

  const endMinus3Days=new Date(end.getTime()-3*86400000);
  const staleAccounts=treasury.accounts.filter(a=>a.active&&a.dailyUpdateRequired).filter(a=>{
    const snapshots=treasury.accountSnapshots.filter(s=>s.accountId===a.id&&inPeriod(s.capturedAt,start,end));
    if(!snapshots.length)return true;
    const latest=Math.max(...snapshots.map(s=>new Date(s.capturedAt).getTime()).filter(Number.isFinite));
    return !Number.isFinite(latest)||latest<endMinus3Days.getTime();
  });

  const criticalReserveAlerts=reserves.alerts.filter(a=>a.severity==="CRITICAL");
  const reserveShortfalls=reserves.byCurrency.filter(r=>r.shortfall>0&&!r.overReserved);
  const countryMinimums=reserves.countryMinimums.filter(r=>!r.met);

  const checks:MonthlyCloseCheck[]=[
    {code:"BANK_RECONCILIATION",label:"Transactions bancaires rapprochées",severity:unreconciled.length?"BLOCKING":"OK",count:unreconciled.length,detail:unreconciled.length?`${unreconciled.length} transaction(s) bancaire(s) du mois restent non rapprochées.`:"Toutes les transactions bancaires importées du mois sont rapprochées ou ignorées."},
    {code:"PENDING_AUTHORIZATIONS",label:"Autorisations financières",severity:pendingAuthorizations.length?"BLOCKING":"OK",count:pendingAuthorizations.length,detail:pendingAuthorizations.length?`${pendingAuthorizations.length} autorisation(s) antérieures à la fin du mois sont encore en attente.`:"Aucune autorisation financière en attente ne bloque la période."},
    {code:"EXECUTION_EVIDENCE",label:"Preuves d’exécution",severity:approvedWithoutEvidence.length?"BLOCKING":"OK",count:approvedWithoutEvidence.length,detail:approvedWithoutEvidence.length?`${approvedWithoutEvidence.length} autorisation(s) approuvée(s) pendant le mois n’ont pas de preuve d’exécution.`:"Les autorisations approuvées du mois disposent de leur preuve d’exécution."},
    {code:"TRANSFERS_IN_TRANSIT",label:"Transferts internes",severity:inTransit.length?"BLOCKING":"OK",count:inTransit.length,detail:inTransit.length?`${inTransit.length} transfert(s) initié(s) avant la fin du mois sont encore en transit.`:"Aucun transfert antérieur à la fin du mois n’est encore en transit."},
    {code:"ACCOUNT_SYNC",label:"Synchronisation des comptes",severity:staleAccounts.length?"BLOCKING":"OK",count:staleAccounts.length,detail:staleAccounts.length?`${staleAccounts.length} compte(s) à mise à jour quotidienne n’ont pas de snapshot suffisamment proche de la fin du mois.`:"Les comptes à suivi quotidien ont un snapshot de fin de période."},
    {code:"RESERVE_CRITICAL",label:"Protection des réserves",severity:criticalReserveAlerts.length?"BLOCKING":"OK",count:criticalReserveAlerts.length,detail:criticalReserveAlerts.length?`${criticalReserveAlerts.length} alerte(s) critique(s) de réserve doivent être résolues avant clôture.`:"Aucune alerte critique de réserve."},
    {code:"COUNTRY_MINIMUM",label:"Minimums de trésorerie pays",severity:countryMinimums.length?"BLOCKING":"OK",count:countryMinimums.length,detail:countryMinimums.length?`${countryMinimums.length} minimum(s) de trésorerie pays ne sont pas atteints.`:"Tous les minimums de trésorerie pays sont atteints."},
    {code:"RESERVE_TARGET",label:"Objectifs de réserves",severity:reserveShortfalls.length?"WARNING":"OK",count:reserveShortfalls.length,detail:reserveShortfalls.length?`${reserveShortfalls.length} devise(s) présentent encore un manque par rapport aux objectifs de réserve.`:"Les objectifs de réserves sont couverts."},
  ];
  const blockingCount=checks.filter(c=>c.severity==="BLOCKING").reduce((s,c)=>s+c.count,0);
  const warningCount=checks.filter(c=>c.severity==="WARNING").reduce((s,c)=>s+c.count,0);
  return{period,canClose:blockingCount===0,blockingCount,warningCount,checks};
}

export async function assertFinancialMonthReadyToClose(period:string){const validation=await validateFinancialMonthClose(period);if(!validation.canClose){const labels=validation.checks.filter(c=>c.severity==="BLOCKING").map(c=>`${c.label}: ${c.count}`).join("; ");throw new Error(`Clôture bloquée par les contrôles préalables. ${labels}`)}return validation}
