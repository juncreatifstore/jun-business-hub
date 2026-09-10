"use client";

import { Suspense, useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ContextBack } from "./context-back";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { ThemeProvider, useTheme } from "./theme";
import { ResponsiveTables } from "./responsive-tables";
import { Toaster } from "@/components/ui/toast";
import type { Theme } from "@/lib/theme";

const SIDEBAR_KEY = "jun.sidebar.collapsed";

export function AppShell({
  user,
  unread,
  theme,
  children,
}: {
  user: { firstName: string; lastName: string; role: string };
  unread: number;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider initial={theme}>
      <ShellFrame user={user} unread={unread}>
        {children}
      </ShellFrame>
    </ThemeProvider>
  );
}

function ShellFrame({
  user,
  unread,
  children,
}: {
  user: { firstName: string; lastName: string; role: string };
  unread: number;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
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
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <div data-theme={theme} className="flex min-h-screen bg-canvas text-ink">
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        role={user.role}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} unread={unread} onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pt-6 lg:pb-8">
          <div className="mx-auto w-full max-w-[1720px]">
            <ContextBack />
            <ResponsiveTables />
            {children}
          </div>
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setOpen(true)} />
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
    </div>
  );
}
