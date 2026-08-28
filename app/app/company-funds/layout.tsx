import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue";
import { getTreasuryStore } from "@/lib/company-funds";
import { CompanyFundsNav } from "@/components/app/company-funds-nav";
import { CompanyFundsMobileNav } from "@/components/app/company-funds-mobile-nav";
import { CompanyFundsPageMemory } from "@/components/app/company-funds-page-memory";
import { CompanyFundsOverviewNavigator } from "@/components/app/company-funds-overview-navigator";
import { CompanyFundsFilters } from "@/components/app/company-funds-filters";

export default async function CompanyFundsLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  if(user.role!=="SUPER_ADMIN") redirect("/app/forbidden");
  const [workQueue,store]=await Promise.all([getCompanyFundsWorkQueue(),getTreasuryStore()]);
  const countries=[...new Set([
    ...store.accounts.map(item=>item.country),
    ...store.integrations.map(item=>item.country),
    ...store.partners.map(item=>item.country),
    ...store.loans.map(item=>item.country),
    ...store.investments.map(item=>item.country),
    ...store.sources.map(item=>item.country),
  ].map(value=>String(value||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr"));
  const currencies=[...new Set([
    ...store.accounts.map(item=>item.currency),
    ...store.integrations.map(item=>item.currency),
    ...store.partners.map(item=>item.currency),
    ...store.loans.map(item=>item.currency),
    ...store.investments.map(item=>item.currency),
    ...store.sources.map(item=>item.currency),
    ...store.projectCashflows.map(item=>item.currency),
  ].map(value=>String(value||"").trim().toUpperCase()).filter(Boolean))].sort();
  return <div className="space-y-5 pb-20 md:pb-0"><CompanyFundsNav workQueue={workQueue}/><CompanyFundsFilters countries={countries} currencies={currencies}/><CompanyFundsOverviewNavigator/><CompanyFundsPageMemory>{children}</CompanyFundsPageMemory><CompanyFundsMobileNav workQueue={workQueue}/></div>;
}
