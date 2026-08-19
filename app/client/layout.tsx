import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logout } from "@/app/login/actions";
import { LogOut } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "CLIENT") redirect("/app");

  const account = await prisma.clientAccount.findUnique({ where: { userId: user.id }, include: { client: true } });
  if (!account || !account.isEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night px-6 text-white">
        <div className="max-w-md text-center">
          <p className="registry-id text-gold">JUN CLIENT PORTAL</p>
          <h1 className="mt-3 font-display text-2xl">Portal access not enabled</h1>
          <p className="mt-3 text-sm text-white/60">Your account exists but the portal is not activated yet. Please contact JUN CREATIF AND TRAVEL LLC.</p>
          <form action={logout} className="mt-6"><button className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:border-gold hover:text-gold">Sign out</button></form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-night text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/client" className="font-display text-lg tracking-wide">JUN <span className="text-gold">Client Portal</span></Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">{account.client.firstName} {account.client.lastName} · <span className="registry-id">{account.client.internalId}</span></span>
            <form action={logout}>
              <button className="flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-white/70 hover:border-gold hover:text-gold" title="Sign out">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        JUN CREATIF AND TRAVEL LLC · Read-only portal · Questions? contact@juncreatif.org
      </footer>
    </div>
  );
}
