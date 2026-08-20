"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const SECTION_ROOTS = new Set([
  "/app",
  "/app/mail",
  "/app/drive",
  "/app/documents",
  "/app/signatures",
  "/app/clients",
  "/app/cases",
  "/app/tasks",
  "/app/finance",
  "/app/ai",
  "/app/vault",
  "/app/team",
  "/app/settings",
]);

export function ContextBack() {
  const pathname = usePathname();
  const router = useRouter();
  if (!pathname || SECTION_ROOTS.has(pathname)) return null;

  return (
    <div className="mb-4 print:hidden">
      <button
        type="button"
        onClick={() => {
          if (window.history.length > 1) router.back();
          else router.push("/app");
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-muted2 transition hover:bg-surface hover:text-ink"
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back / Retour
      </button>
    </div>
  );
}
