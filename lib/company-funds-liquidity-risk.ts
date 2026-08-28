import "server-only";
import { getTreasuryStore, type TreasuryStore } from "@/lib/company-funds";
import { listFinancialReserves } from "@/lib/company-funds-reserves";
import { filterTreasuryStore, type CompanyFundsFilterParams } from "@/lib/company-funds-filters";

function round(v:number){return Math.round((Number(v||0)+Number.EPSILON)*100)/100}

type Horizon=30|60|90;
export type ProtectedCashForecast={
  currency:string;horizon:Horizon;cashNow:number;reserved:number;availableNow:number;plannedIn:number;plannedOut:number;loanDue:number;investmentPlanned:number;projectedCash:number;protectedAvailable:number;reserveDeficit:number;status:"HEALTHY"|"WATCH"|"CRITICAL";
};

const emptyFilters:CompanyFundsFilterParams={country:"",currency:"",periodDays:null};

function reserveMatchesScope(reserve:{country:string|null;currency:string;accountId:string|null},store:TreasuryStore,filters:CompanyFundsFilterParams){
  if(filters.currency&&reserve.currency!==filters.currency)return false;
  if(!filters.country)return true;
  if(reserve.country)return reserve.country===filters.country;
  if(reserve.accountId)return store.accounts.some(account=>account.id===reserve.accountId);
  return false;
}

export async function getProtectedCashForecast(filters:CompanyFundsFilterParams=emptyFilters){
  const [rawStore,reserves]=await Promise.all([getTreasuryStore(),listFinancialReserves()]);
  const store=filterTreasuryStore(rawStore,{...filters,periodDays:null});
  const activeReserves=reserves.filter(r=>r.active&&reserveMatchesScope(r,store,filters));
  const now=new Date();
  const currencies=[...new Set([...store.accounts.filter(a=>a.active).map(a=>a.currency),...store.forecastItems.filter(f=>f.status!=="CANCELLED").map(f=>f.currency),...activeReserves.map(r=>r.currency),...store.loans.filter(l=>l.status==="ACTIVE").map(l=>l.currency),...store.investments.filter(i=>i.status==="PLANNED").map(i=>i.currency)])].sort();
  const horizons:Horizon[]=[30,60,90];const rows:ProtectedCashForecast[]=[];
  for(const currency of currencies){
    const cashNow=round(store.accounts.filter(a=>a.active&&a.currency===currency).reduce((s,a)=>s+a.balance,0));
    const reserveRows=activeReserves.filter(r=>r.currency===currency);
    const reserved=round(reserveRows.reduce((s,r)=>s+r.reservedAmount,0));
    const reserveTarget=round(reserveRows.reduce((s,r)=>s+r.targetAmount,0));
    const availableNow=round(cashNow-reserved);
    for(const horizon of horizons){
      const end=new Date(now.getTime()+horizon*86400000);
      const planned=store.forecastItems.filter(f=>f.currency===currency&&!["PAID","CANCELLED"].includes(f.status)&&new Date(f.dueDate)>=now&&new Date(f.dueDate)<=end);
      const plannedIn=round(planned.filter(f=>f.direction==="IN").reduce((s,f)=>s+f.amount,0));
      const plannedOut=round(planned.filter(f=>f.direction==="OUT").reduce((s,f)=>s+f.amount,0));
      const loanDue=round(store.loans.filter(l=>l.status==="ACTIVE"&&l.currency===currency&&new Date(l.dueDate)>=now&&new Date(l.dueDate)<=end).reduce((s,l)=>s+l.outstandingBalance,0));
      const investmentPlanned=round(store.investments.filter(i=>i.status==="PLANNED"&&i.currency===currency&&new Date(i.investedAt)>=now&&new Date(i.investedAt)<=end).reduce((s,i)=>s+i.amount,0));
      const projectedCash=round(cashNow+plannedIn-plannedOut-loanDue-investmentPlanned);
      const protectedAvailable=round(projectedCash-reserved);const reserveDeficit=Math.max(0,round(reserveTarget-projectedCash));
      const status:ProtectedCashForecast["status"]=projectedCash<reserved||protectedAvailable<0?"CRITICAL":reserveDeficit>0||protectedAvailable<Math.max(1000,cashNow*.1)?"WATCH":"HEALTHY";
      rows.push({currency,horizon,cashNow,reserved,availableNow,plannedIn,plannedOut,loanDue,investmentPlanned,projectedCash,protectedAvailable,reserveDeficit,status});
    }
  }
  return rows;
}

export async function getLiquidityProtectionAlerts(filters:CompanyFundsFilterParams=emptyFilters){
  const rows=await getProtectedCashForecast(filters);
  return rows.filter(r=>r.status!=="HEALTHY").map(r=>({id:`liquidity-${r.currency}-${r.horizon}`,severity:r.status==="CRITICAL"?"CRITICAL" as const:"WARNING" as const,title:r.status==="CRITICAL"?`Trésorerie protégée critique à ${r.horizon} jours`:`Réserve sous pression à ${r.horizon} jours`,detail:r.status==="CRITICAL"?`Le cash projeté ne couvre plus les réserves protégées. Disponible après réserves: ${r.protectedAvailable.toFixed(2)} ${r.currency}.`:`Le niveau projeté devient proche ou inférieur à l’objectif de sécurité. Déficit potentiel: ${r.reserveDeficit.toFixed(2)} ${r.currency}.`,currency:r.currency}));
}
