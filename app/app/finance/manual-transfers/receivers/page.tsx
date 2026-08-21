import { requirePermission, can } from "@/lib/auth";
import { getManualTransferReceivers } from "@/lib/finance-manual-transfers";
import { createManualTransferReceiver, toggleManualTransferReceiver } from "@/services/finance-manual-transfers";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function ManualReceiversPage() {
  const user = await requirePermission("PAYMENT_READ");
  const receivers = await getManualTransferReceivers();
  const canManage = can(user, "SETTINGS_MANAGE");
  return <div>
    <PageHeader title="Manual transfer receivers" subtitle="Configure Western Union receivers and bank beneficiaries used in professional payment orders." />
    {canManage ? <Card className="mb-5"><CardHeader><CardTitle>Add receiver</CardTitle></CardHeader><CardContent><form action={createManualTransferReceiver} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Label"><Input name="label" required placeholder="Example: WU Mexico receiver" /></Field>
      <Field label="Rail"><Select name="rail" defaultValue="WESTERN_UNION"><option value="WESTERN_UNION">Western Union</option><option value="BANK_TRANSFER">Bank transfer</option></Select></Field>
      <Field label="Receiver type"><Select name="receiverType" defaultValue="BUSINESS"><option value="BUSINESS">Business</option><option value="INDIVIDUAL_BUSINESS_REPRESENTATIVE">Authorized business representative</option></Select></Field>
      <Field label="Receiver currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
      <Field label="Legal name"><Input name="legalName" required /></Field>
      <Field label="Country"><Input name="country" /></Field>
      <Field label="City"><Input name="city" /></Field>
      <Field label="Address"><Input name="address" /></Field>
      <Field label="Phone"><Input name="phone" /></Field>
      <Field label="Email"><Input name="email" type="email" /></Field>
      <Field label="Bank name"><Input name="bankName" /></Field>
      <Field label="Bank address"><Input name="bankAddress" /></Field>
      <Field label="Account number"><Input name="accountNumber" /></Field>
      <Field label="IBAN"><Input name="iban" /></Field>
      <Field label="SWIFT / BIC"><Input name="swiftBic" /></Field>
      <Field label="Routing / ABA"><Input name="routingNumber" /></Field>
      <Field label="CLABE"><Input name="clabe" /></Field>
      <Field label="Branch code"><Input name="branchCode" /></Field>
      <Field label="Fee %"><Input name="feePercent" type="number" min="0" step="0.01" defaultValue="0" /></Field>
      <Field label="Fixed fee"><Input name="feeFixed" type="number" min="0" step="0.01" defaultValue="0" /></Field>
      <div className="md:col-span-2 xl:col-span-4"><Field label="Compliance / special instructions"><Textarea name="complianceNote" rows={3} placeholder="Only truthful business-purpose instructions. Never ask the sender to misrepresent the transaction." /></Field></div>
      <div className="md:col-span-2 xl:col-span-4"><Button variant="primary">Add receiver</Button></div>
    </form></CardContent></Card> : null}

    <div className="grid gap-4 lg:grid-cols-2">{receivers.map((r) => <Card key={r.id}><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>{r.label}</CardTitle><p className="mt-1 text-xs text-muted2">{r.rail.replaceAll("_", " ")} · {r.currency} · {r.country || "Country not set"}</p></div><span className={`rounded-full px-2 py-1 text-xs ${r.enabled ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted2"}`}>{r.enabled ? "Active" : "Disabled"}</span></div></CardHeader><CardContent className="space-y-3 text-sm"><div><div className="font-medium">{r.legalName}</div><div className="text-xs text-muted2">{[r.bankName, r.accountNumber, r.swiftBic || r.iban || r.clabe].filter(Boolean).join(" · ") || [r.phone, r.email].filter(Boolean).join(" · ") || "No extra details"}</div></div><div className="text-xs text-muted2">Fees: {r.feePercent.toFixed(2)}% + {r.currency} {r.feeFixed.toFixed(2)}</div>{canManage ? <form action={toggleManualTransferReceiver.bind(null, r.id)}><Button variant="outline">{r.enabled ? "Disable" : "Enable"}</Button></form> : null}</CardContent></Card>)}{receivers.length === 0 ? <p className="text-sm text-muted2">No manual transfer receiver configured yet.</p> : null}</div>
  </div>;
}
