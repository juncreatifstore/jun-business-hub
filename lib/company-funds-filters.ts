import "server-only";
import type { TreasuryStore } from "@/lib/company-funds";

export type CompanyFundsFilterParams={country:string;currency:string;periodDays:number|null};

type SearchParams={country?:string;currency?:string;period?:string};

export function parseCompanyFundsFilters(searchParams?:SearchParams):CompanyFundsFilterParams{
  const country=String(searchParams?.country||"").trim();
  const currency=String(searchParams?.currency||"").trim().toUpperCase();
  const rawPeriod=Number(searchParams?.period||0);
  const periodDays=[30,90,365].includes(rawPeriod)?rawPeriod:null;
  return{country,currency,periodDays};
}

function inPeriod(value:string|null|undefined,cutoff:number|null){
  if(!cutoff)return true;
  if(!value)return false;
  const time=new Date(value).getTime();
  return Number.isFinite(time)&&time>=cutoff;
}

export function filterTreasuryStore(store:TreasuryStore,filters:CompanyFundsFilterParams):TreasuryStore{
  const {country,currency,periodDays}=filters;
  const cutoff=periodDays?Date.now()-periodDays*24*60*60*1000:null;
  const countryOk=(value:string)=>!country||String(value||"").trim()===country;
  const currencyOk=(value:string)=>!currency||String(value||"").trim().toUpperCase()===currency;

  const accounts=store.accounts.filter(item=>countryOk(item.country)&&currencyOk(item.currency));
  const accountIds=new Set(accounts.map(item=>item.id));

  const integrations=store.integrations.filter(item=>countryOk(item.country)&&currencyOk(item.currency));
  const integrationIds=new Set(integrations.map(item=>item.id));

  const partners=store.partners.filter(item=>countryOk(item.country)&&currencyOk(item.currency));
  const partnerIds=new Set(partners.map(item=>item.id));

  const loans=store.loans.filter(item=>countryOk(item.country)&&currencyOk(item.currency));
  const investments=store.investments.filter(item=>countryOk(item.country)&&currencyOk(item.currency)&&(!item.projectIntegrationId||integrationIds.has(item.projectIntegrationId)));
  const sources=store.sources.filter(item=>countryOk(item.country)&&currencyOk(item.currency)&&inPeriod(item.receivedAt,cutoff)&&(!item.accountId||accountIds.has(item.accountId))&&(!item.partnerId||partnerIds.has(item.partnerId)));

  const projectCashflows=store.projectCashflows.filter(item=>integrationIds.has(item.integrationId)&&currencyOk(item.currency)&&inPeriod(item.occurredAt,cutoff)&&(!item.accountId||accountIds.has(item.accountId)));
  const accountSnapshots=store.accountSnapshots.filter(item=>accountIds.has(item.accountId)&&inPeriod(item.capturedAt,cutoff));
  const reconciliations=store.reconciliations.filter(item=>accountIds.has(item.accountId)&&inPeriod(item.resolvedAt||item.createdAt,cutoff));
  const forecastItems=store.forecastItems.filter(item=>currencyOk(item.currency)&&(!item.accountId||accountIds.has(item.accountId))&&(!item.projectIntegrationId||integrationIds.has(item.projectIntegrationId)));

  return{
    ...store,
    accounts,
    sources,
    partners,
    loans,
    investments,
    integrations,
    projectCashflows,
    accountSnapshots,
    reconciliations,
    forecastItems,
  };
}

export function companyFundsFilterLabel(filters:CompanyFundsFilterParams){
  const parts:string[]=[];
  if(filters.country)parts.push(filters.country);
  if(filters.currency)parts.push(filters.currency);
  if(filters.periodDays)parts.push(`${filters.periodDays} jours`);
  return parts.join(" · ");
}
