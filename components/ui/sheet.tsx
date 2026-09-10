"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet for mobile. Server components can render it and pass any
 * children (including forms / server actions) — only the open state lives here.
 * Closes on backdrop tap, Escape, or the close button.
 */
export function Sheet({
  trigger,
  title,
  children,
  className,
}: {
  trigger: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        className={className}
      >
        {trigger}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70]" role="presentation">
          <div className="absolute inset-0 bg-night/50" onClick={() => setOpen(false)} />
          <div
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-surface-1 shadow-pop"
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" />
            <div className="flex items-center justify-between px-4 pb-2 pt-2">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={cn("overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]")}>
              {children}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
