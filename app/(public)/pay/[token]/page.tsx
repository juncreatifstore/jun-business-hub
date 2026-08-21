import { notFound } from "next/navigation";
import { getOnlinePaymentSessionByToken } from "@/lib/finance-online-payments";

export const dynamic = "force-dynamic";

export default async function PublicOnlinePaymentPage({ params, searchParams }: { params: { token: string }; searchParams: { result?: string } }) {
  const session = await getOnlinePaymentSessionByToken(params.token);
  if (!session) notFound();
  const paid = session.status === "PAID";
  const active = session.status === "PENDING" && new Date(session.expiresAt).getTime() > Date.now();
  const result = searchParams.result;

  return <main className="mx-auto max-w-xl px-4 py-12">
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="border-b border-line bg-surface px-6 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted2">JUN CREATIF AND TRAVEL LLC</div>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Secure payment</h1>
      </div>
      <div className="space-y-5 p-6">
        {paid ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><strong>Payment confirmed.</strong> Your transaction has been verified by the payment provider.</div> : null}
        {!paid && result === "success" ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">The provider returned a successful checkout response. JUN is waiting for secure provider confirmation before marking the payment as paid.</div> : null}
        {!paid && ["failure","cancel"].includes(result || "") ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">The payment was not completed. You may retry while this payment link remains active.</div> : null}

        <div>
          <div className="text-xs text-muted2">Payment for</div>
          <div className="mt-1 text-lg font-semibold text-ink">{session.clientName}</div>
          <div className="mt-1 text-sm text-muted2">{session.description}</div>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <div className="text-xs text-muted2">Amount due</div>
          <div className="mt-1 text-3xl font-semibold text-ink">{new Intl.NumberFormat("en-US", { style: "currency", currency: session.currency }).format(session.amount)}</div>
          <div className="mt-2 text-xs text-muted2">Provider: {session.provider.replaceAll("_", " ")} · Status: {session.status}</div>
        </div>

        {active && session.checkoutUrl ? <a href={session.checkoutUrl} rel="nofollow noreferrer" className="flex w-full items-center justify-center rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white hover:opacity-90">Continue to {session.provider.replaceAll("_", " ")}</a> : null}
        {!paid && !active ? <div className="rounded-xl border border-line bg-surface p-4 text-sm text-muted2">This payment link is no longer active. Contact JUN to request a new secure payment link.</div> : null}

        <div className="border-t border-line pt-4 text-xs leading-5 text-muted2">Never send card credentials, passwords, PINs or verification codes to an agent. Online card or wallet details are entered only on the selected provider's secure checkout.</div>
      </div>
    </div>
  </main>;
}
