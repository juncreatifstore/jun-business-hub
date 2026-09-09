import { FinanceWorkspaceNav } from "@/components/app/finance-workspace-nav";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <div data-finance-release="finance-v2-2026-09-09">
    <FinanceWorkspaceNav />
    {children}
  </div>;
}
