import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientFinancialAccount } from "@/lib/client-financial-account";
import { updateClientFinancialProfile, addPartnerCommission, voidPartnerCommission } from "@/services/client-financial-account";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { formatDateTime, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ClientAccountPage({ params }: { params: { id: string } }) {
  const user = await requirePermission("CLIENT_READ");
  const [client, account] = await Promise.all([
    prisma.client.findUnique({ where: { id: params.id }, select: { id: true, internalId: true, firstName: true, lastName: true } }),
    getClientFinancialAccount(params.id),
  ]);
  if (!client) notFound();
  const canUpdate = can(user, "CLIENT_UPDATE");
  const canCredit = can(user, "PAYMENT_CREATE");
  const canVoid = can(user, "PAYMENT_APPROVE");

  return <div className="max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="registry-id text-muted2">{client.internalId}</p><h1 className="mt-1 text-2xl font-semibold">{client.firstName} {client.lastName} · Financial account</h1><p className="mt-1 text-sm text-muted2">Global client balance, refunds/withdrawals and partner commissions.</p></div>
      <div className="flex gap-2"><Link href={`/app/clients/${client.id}`}><Button variant="outline">Back to client</Button></Link><Link href={`/app/clients/${client.id}/statement`}><Button variant="primary">Open statement</Button></Link></div>
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {account.balances.length ? account.balances.map((b) => <Card key={b.currency}><CardContent className="p-4"><div className="text-xs text-muted2">Available balance · {b.currency}</div><div className="mt-1 text-2xl font-semibold">{formatMoney(b.available, b.currency)}</div><div className="mt-2 space-y-1 text-xs text-muted2"><div>Confirmed funds: {formatMoney(b.confirmedFunds, b.currency)}</div><div>Partner commissions: +{formatMoney(b.commissions, b.currency)}</div><div>Approved refunds / withdrawals: -{formatMoney(b.activeRefunds, b.currency)}</div><div>Pending refund requests: {formatMoney(b.pendingRefunds, b.currency)}</div><div>Actually paid out: {formatMoney(b.refundsPaid, b.currency)}</div></div></CardContent></Card>) : <Card><CardContent className="p-4 text-sm text-muted2">No financial movement yet.</CardContent></Card>}
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Client financial profile</CardTitle></CardHeader><CardContent>
        {canUpdate ? <form action={updateClientFinancialProfile.bind(null, client.id)} className="space-y-4">
          <Field label="Statement language"><Select name="preferredLanguage" defaultValue={account.profile.preferredLanguage}><option value="FR">Français</option><option value="EN">English</option><option value="ES">Español</option><option value="HT">Kreyòl ayisyen</option></Select></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPartner" defaultChecked={account.profile.isPartner} /> Client is a partner / commission earner</label>
          <Field label="Partner note"><Textarea name="partnerNote" rows={4} defaultValue={account.profile.partnerNote} placeholder="Agreement, commission rules, territory, referral arrangement…" /></Field>
          <Button variant="primary">Save account profile</Button>
        </form> : <div className="text-sm"><div>Language: {account.profile.preferredLanguage}</div><div className="mt-1">Partner: {account.profile.isPartner ? "Yes" : "No"}</div></div>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Credit partner commission</CardTitle></CardHeader><CardContent>
        {!account.profile.isPartner ? <p className="text-sm text-amber-700">Enable Partner status before crediting commissions.</p> : canCredit ? <form action={addPartnerCommission.bind(null, client.id)} className="grid gap-4 sm:grid-cols-2"><Field label="Amount"><Input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field><div className="sm:col-span-2"><Field label="Description"><Input name="description" placeholder="Referral commission, sales commission…" required /></Field></div><div className="sm:col-span-2"><Field label="Source reference"><Input name="sourceReference" placeholder="Booking, invoice, case or campaign reference" /></Field></div><div className="sm:col-span-2"><Button variant="primary">Credit commission to balance</Button></div></form> : <p className="text-sm text-muted2">You do not have permission to credit commissions.</p>}
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Commission history</CardTitle></CardHeader><CardContent>{account.commissions.length ? <div className="divide-y divide-line rounded-lg border border-line">{account.commissions.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><div className="font-medium">{c.description}</div><div className="text-xs text-muted2">{c.sourceReference || "No source reference"} · {formatDateTime(new Date(c.createdAt))} · {c.status}</div>{c.voidReason ? <div className="mt-1 text-xs text-red-600">Void reason: {c.voidReason}</div> : null}</div><div className="flex items-center gap-3"><div className={c.status === "CREDITED" ? "font-semibold text-emerald-700" : "font-semibold text-muted2 line-through"}>+{formatMoney(c.amount, c.currency)}</div>{canVoid && c.status === "CREDITED" ? <form action={voidPartnerCommission.bind(null, client.id, c.id)} className="flex gap-2"><Input name="reason" required placeholder="Correction reason" className="h-8 w-48 text-xs" /><Button size="sm" variant="outline">Void</Button></form> : null}</div></div>)}</div> : <p className="text-sm text-muted2">No partner commission recorded.</p>}</CardContent></Card>
  </div>;
}
