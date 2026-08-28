import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCompanyFundsWorkQueue } from "@/lib/company-funds-work-queue";
import { CompanyFundsNav } from "@/components/app/company-funds-nav";
import { CompanyFundsMobileNav } from "@/components/app/company-funds-mobile-nav";
import { CompanyFundsPageMemory } from "@/components/app/company-funds-page-memory";

export default async function CompanyFundsLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  if(user.role!=="SUPER_ADMIN") redirect("/app/forbidden");
  const workQueue=await getCompanyFundsWorkQueue();
  return <div className="space-y-5 pb-20 md:pb-0"><CompanyFundsNav workQueue={workQueue}/><CompanyFundsPageMemory>{children}</CompanyFundsPageMemory><CompanyFundsMobileNav workQueue={workQueue}/></div>;
}
