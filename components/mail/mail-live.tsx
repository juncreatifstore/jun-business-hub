"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the mail list current without a manual reload: the cron syncs every
 * 5 minutes and revalidates the page; this refreshes the server tree every 60 s
 * while the tab is visible, never while the agent is typing (compose/search).
 */
export function MailLive() {
  const router = useRouter();
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return Boolean(el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable));
    };
    const tick = () => {
      if (document.visibilityState === "visible" && !typing()) router.refresh();
    };
    const id = setInterval(tick, 60_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}
