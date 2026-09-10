"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { acknowledgeWhatsAppConversation } from "@/services/whatsapp-inbox";

type Pulse = {
  stamp: string;
  unread: number;
  latest: { at: string; inbound: boolean; phone: string; name: string; preview: string } | null;
};

const INTERVAL_MS = 10_000;

/**
 * Keeps the inbox alive without a manual reload:
 *  - polls /pulse every 10s while the tab is visible and refreshes the server
 *    component tree only when something changed
 *  - never refreshes while the agent is typing in a composer
 *  - sends the read receipt when a conversation is opened
 *  - shows the unread count in the tab title and (opt-in) a browser notification
 */
export function InboxLive({ openPhone, unread }: { openPhone: string | null; unread: number }) {
  const router = useRouter();
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">("default");
  const stampRef = useRef<string | null>(null);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread]);

  useEffect(() => {
    if (!openPhone) return;
    acknowledgeWhatsAppConversation(openPhone)
      .then((r) => {
        if (r?.changed) router.refresh();
      })
      .catch(() => {});
  }, [openPhone, router]);

  useEffect(() => {
    setNotif(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const typing = () => {
      const el = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
      if (!el) return false;
      if (el.tagName === "TEXTAREA") return Boolean(el.value);
      if (el.tagName === "INPUT" && el.type !== "search") return Boolean(el.value);
      return false;
    };

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/whatsapp/inbox/pulse", { cache: "no-store" });
          if (res.ok) {
            const pulse = (await res.json()) as Pulse;
            const previous = stampRef.current;
            if (previous !== pulse.stamp) {
              stampRef.current = pulse.stamp;
              if (previous !== null) {
                if (!typing()) router.refresh();
                if (
                  pulse.latest?.inbound &&
                  typeof Notification !== "undefined" &&
                  Notification.permission === "granted" &&
                  pulse.latest.phone !== openPhone
                ) {
                  const target = pulse.latest.phone;
                  const n = new Notification(pulse.latest.name || `+${target}`, {
                    body: pulse.latest.preview || "Nouveau message WhatsApp",
                    tag: `wa-${target}`,
                  });
                  n.onclick = () => {
                    window.focus();
                    router.push(`/app/whatsapp/inbox?phone=${encodeURIComponent(target)}`);
                  };
                }
              }
            }
          }
        } catch {}
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, openPhone]);

  if (notif === "unsupported" || notif === "denied") return null;
  return (
    <button
      type="button"
      onClick={async () => setNotif(await Notification.requestPermission())}
      title={
        notif === "granted" ? "Notifications activées" : "Activer les notifications de nouveaux messages"
      }
      aria-label="Notifications"
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-1 transition hover:bg-surface-2 ${
        notif === "granted" ? "text-accent" : "text-ink-2"
      }`}
    >
      {notif === "granted" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
    </button>
  );
}
