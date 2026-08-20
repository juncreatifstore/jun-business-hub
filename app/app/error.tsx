"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("JUN app error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-2xl border border-red-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
        <h1 className="mt-4 text-xl font-semibold">Something went wrong / Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-muted2">The action could not be completed. Try again, or return to the dashboard.</p>
        {error.digest ? <p className="mt-3 text-xs text-muted2">Reference: <span className="registry-id">{error.digest}</span></p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-lg bg-night px-4 text-sm font-medium text-white hover:bg-night-soft"><RotateCcw className="h-4 w-4" />Retry / Réessayer</button>
          <Link href="/app" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface"><Home className="h-4 w-4" />Dashboard / Accueil</Link>
        </div>
      </div>
    </div>
  );
}
