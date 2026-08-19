"use client";
// Lightweight toast system driven by the ?toast= search param that server
// actions set on redirect, plus a client event channel for in-page use.
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

type Toast = { id: number; message: string; kind: "success" | "error" };

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const msg = params.get("toast");
    const err = params.get("toast_error");
    if (msg || err) {
      const t: Toast = { id: Date.now(), message: msg ?? err ?? "", kind: msg ? "success" : "error" };
      setToasts((prev) => [...prev, t]);
      const url = new URL(window.location.href);
      url.searchParams.delete("toast");
      url.searchParams.delete("toast_error");
      router.replace(url.pathname + url.search, { scroll: false });
      const timer = setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4500);
      return () => clearTimeout(timer);
    }
  }, [params, router, pathname]);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 text-sm shadow-lg"
          role="status"
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )}
          {t.message}
        </div>
      ))}
    </div>
  );
}
