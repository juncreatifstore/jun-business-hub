"use client";
import { useState, Suspense } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const editorWorkspace = pathname.startsWith("/app/editor");

  if (editorWorkspace) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] text-slate-900">
        {children}
        <Suspense fallback={null}><Toaster /></Suspense>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} unread={unread} onMenu={() => setOpen(true)} />
        <main className="flex-1 p-4 sm:p-6"><ContextBack />{children}</main>
      </div>
      <Suspense fallback={null}><Toaster /></Suspense>
    </div>
  );
}
