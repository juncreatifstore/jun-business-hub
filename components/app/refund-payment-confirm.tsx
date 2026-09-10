"use client";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { confirmPlannedRefundPayment } from "@/services/refund-payment-plan";
import { Button } from "@/components/ui/button";

function Submit({ ready, last }: { ready: boolean; last: boolean }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="primary" className="min-h-11 w-full sm:w-auto" disabled={!ready || pending}>{pending ? "Vérification…" : last ? "Confirmer le dernier versement" : "Confirmer ce versement partiel"}</Button>;
}
export function RefundPaymentConfirm({ installmentId, ready, last }: { installmentId: string; ready: boolean; last: boolean }) {
  const [state, action] = useFormState(confirmPlannedRefundPayment.bind(null, installmentId), { message: "", success: false });
  return <form action={action} className="w-full space-y-2 sm:w-auto">
    <Submit ready={ready && !state.success} last={last} />
    {state.message && <p role={state.success ? "status" : "alert"} className={`max-w-lg text-sm ${state.success ? "text-emerald-300" : "text-red-300"}`}>{state.message}</p>}
    {state.message.includes("Autorisation financière requise") && <Link href="/app/company-funds/authorizations" className="inline-flex min-h-11 items-center text-sm text-electric underline">Ouvrir les autorisations financières</Link>}
  </form>;
}
