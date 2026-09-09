"use client";

import { Suspense, useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ContextBack } from "./context-back";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { Toaster } from "@/components/ui/toast";

const SIDEBAR_KEY = "jun.sidebar.collapsed";

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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  return (
    <div className="jun-app-dark flex min-h-screen bg-[#070c14] text-ink">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        role={user.role}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.055),transparent_32%),#070c14]">
        <Header user={user} unread={unread} onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-6">
          <div className="mx-auto w-full max-w-[1720px]">
            <ContextBack />
            {children}
          </div>
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setOpen(true)} />
      <Suspense fallback={null}><Toaster /></Suspense>
    </div>
  );
}
