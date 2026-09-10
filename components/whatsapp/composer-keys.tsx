"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Desktop comfort for the free-text composer:
 *  - Enter sends, Shift+Enter inserts a newline (Ctrl/Cmd+Enter always sends)
 *  - the draft is kept per conversation in sessionStorage and restored when
 *    the agent comes back, cleared on send
 *  - the textarea grows with its content
 */
export function ComposerKeys({ phone }: { phone: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    const key = `wa.draft.${phone}`;
    const areas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[name="message"]'));
    if (!areas.length) return;
    const cleanups: (() => void)[] = [];
    for (const area of areas) {
      const form = area.form;
      const grow = () => {
        area.style.height = "auto";
        area.style.height = `${Math.min(area.scrollHeight, 180)}px`;
      };
      try {
        const saved = sessionStorage.getItem(key);
        if (saved && !area.value) area.value = saved;
      } catch {}
      grow();
      const onInput = () => {
        grow();
        try {
          if (area.value) sessionStorage.setItem(key, area.value);
          else sessionStorage.removeItem(key);
        } catch {}
      };
      const onKey = (e: KeyboardEvent) => {
        const send =
          (e.key === "Enter" && !e.shiftKey && !e.isComposing) ||
          (e.key === "Enter" && (e.metaKey || e.ctrlKey));
        if (!send) return;
        // On phones Enter should insert a newline; the send button is right there.
        if (window.matchMedia("(pointer: coarse)").matches && !(e.metaKey || e.ctrlKey)) return;
        if (!area.value.trim()) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        form?.requestSubmit();
      };
      const onSubmit = () => {
        try {
          sessionStorage.removeItem(key);
        } catch {}
      };
      area.addEventListener("input", onInput);
      area.addEventListener("keydown", onKey);
      form?.addEventListener("submit", onSubmit);
      cleanups.push(() => {
        area.removeEventListener("input", onInput);
        area.removeEventListener("keydown", onKey);
        form?.removeEventListener("submit", onSubmit);
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [phone, pathname, params]);
  return null;
}
