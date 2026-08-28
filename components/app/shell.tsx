"use client";
import { useState, Suspense } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ContextBack } from "./context-back";
import { Toaster } from "@/components/ui/toast";

export function AppShell({
  user,
  unread,
  children,
}: {
  user: { firstName: string; lastName: string; role: string };
  unread: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="jun-app-dark flex min-h-screen bg-[#070c14] text-ink">
      <Sidebar open={open} onClose={() => setOpen(false)} role={user.role} />
      <div className="flex min-w-0 flex-1 flex-col bg-[#070c14]">
        <Header user={user} unread={unread} onMenu={() => setOpen(true)} />
        <main className="flex-1 bg-[#070c14] p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[1720px]">
            <ContextBack />
            {children}
          </div>
        </main>
      </div>
      <Suspense fallback={null}><Toaster /></Suspense>
    </div>
  );
}
