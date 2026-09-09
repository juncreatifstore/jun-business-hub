"use client";

import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshDocumentFromLatestDataAction, type DocumentRefreshState } from "@/services/document-refresh";

function SubmitButton({ fullWidth, variant }: { fullWidth?: boolean; variant: "outline" | "gold" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      className={fullWidth ? "w-full justify-start" : undefined}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {pending ? "Updating from latest data…" : "Update from latest data"}
    </Button>
  );
}

export function DocumentRefreshControl({
  documentId,
  fullWidth = false,
  variant = "outline",
  showResult = true,
}: {
  documentId: string;
  fullWidth?: boolean;
  variant?: "outline" | "gold";
  showResult?: boolean;
}) {
  const router = useRouter();
  const action = refreshDocumentFromLatestDataAction.bind(null, documentId);
  const [state, formAction] = useFormState<DocumentRefreshState, FormData>(action, {});

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status, state.version]);

  return (
    <div className={fullWidth ? "w-full" : ""}>
      <form action={formAction}>
        <SubmitButton fullWidth={fullWidth} variant={variant} />
      </form>
      {showResult && state.message ? (
        <div
          className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            state.status === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
          role="status"
        >
          {state.status === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{state.message}</span>
        </div>
      ) : null}
    </div>
  );
}
