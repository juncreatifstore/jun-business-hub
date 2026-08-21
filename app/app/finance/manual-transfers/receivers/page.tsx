import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { getManualTransferReceivers } from "@/lib/finance-manual-transfers";
import { toggleManualTransferReceiver } from "@/services/finance-manual-transfers";
import { createManualTransferReceiverV2 } from "@/services/finance-manual-receivers-v2";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Building2, CircleDollarSign, UserRound } from "lucide-react";

export const dynamic = "force-dynamic";

function AddressLines({ street, city, state, postal, country }: { street?: string; city?: string; state?: string; postal?: string; country?: string }) {
  const locality = [city, state, postal].filter(Boolean).join(", ");
  return <div className="mt-1 space-y-0.5 text-xs text-muted2">{street ? <div>{street}</div> : null}{locality ? <div>{locality}</div> : null}{country ? <div>{country}</div> : null}</div>;
}

export default async function ManualReceiversPage() {
  const user = await requirePermission("PAYMENT_READ");
  const receivers = await getManualTransferReceivers();
  const canManage = can(user, "SETTINGS_MANAGE");
  return <div>
    <PageHeader title="Manual transfer receivers" subtitle="Keep beneficiary identity, full structured address, bank details and transfer fees separated and explicit in every sender payment order." />
    {canManage ? <form action={createManualTransferReceiverV2} className="mb-5 space-y-4">
      <Card><CardHeader><CardTitle>Receiver setup</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Label"><Input name="label" required placeholder="Example: BOFA Western receiver" /></Field>
        <Field label="Rail"><Select name="rail" defaultValue="WESTERN_UNION"><option value="WESTERN_UNION">Western Union</option><option value="BANK_TRANSFER">Bank transfer</option></Select></Field>
        <Field label="Receiver type"><Select name="receiverType" defaultValue="BUSINESS"><option value="BUSINESS">Business</option><option value="INDIVIDUAL_BUSINESS_REPRESENTATIVE">Authorized business representative</option></Select></Field>
        <Field label="Receiver currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><UserRound className="h-4 w-4"/>Beneficiary information</span></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="First name"><Input name="firstName" /></Field>
        <Field label="Last name"><Input name="lastName" /></Field>
        <Field label="Legal / business name"><Input name="legalName" placeholder="If different from first + last name" /></Field>
        <Field label="Phone"><Input name="phone" /></Field>
        <Field label="Email"><Input name="email" type="email" /></Field>
        <Field label="Street / address"><Input name="receiverStreet" placeholder="438 Thunder Gulch Ct" /></Field>
        <Field label="City"><Input name="city" placeholder="Orlando" /></Field>
        <Field label="State / province"><Input name="receiverState" placeholder="Florida" /></Field>
        <Field label="Postal code"><Input name="receiverPostalCode" placeholder="32824" /></Field>
        <Field label="Country"><Input name="country" placeholder="United States" /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><Building2 className="h-4 w-4"/>Bank information</span></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Bank name"><Input name="bankName" /></Field>
        <Field label="Account holder name"><Input name="accountHolderName" placeholder="Defaults to beneficiary legal name" /></Field>
        <Field label="Account number"><Input name="accountNumber" /></Field>
        <Field label="IBAN"><Input name="iban" /></Field>
        <Field label="SWIFT / BIC"><Input name="swiftBic" /></Field>
        <Field label="Routing / ABA"><Input name="routingNumber" /></Field>
        <Field label="CLABE"><Input name="clabe" /></Field>
        <Field label="Branch code"><Input name="branchCode" /></Field>
        <Field label="Bank street / address"><Input name="bankStreet" placeholder="222 Broadway" /></Field>
        <Field label="Bank city"><Input name="bankCity" placeholder="New York" /></Field>
        <Field label="Bank state / province"><Input name="bankState" placeholder="NY" /></Field>
        <Field label="Bank postal code"><Input name="bankPostalCode" placeholder="10038" /></Field>
        <Field label="Bank country"><Input name="bankCountry" placeholder="United States" /></Field>
      </CardContent></Card>

      <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4"/>Transfer configuration & fees</span></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Fee %"><Input name="feePercent" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <Field label="Fixed fee"><Input name="feeFixed" type="number" min="0" step="0.01" defaultValue="0" /></Field>
        <div className="md:col-span-2 xl:col-span-4"><Field label="Compliance / special instructions"><Textarea name="complianceNote" rows={3} placeholder="Truthful business-purpose instructions, provider requirements, branch notes, etc." /></Field></div>
        <div className="md:col-span-2 xl:col-span-4"><Button variant="primary">Add receiver</Button></div>
      </CardContent></Card>
    </form> : null}

    <div className="grid gap-4 lg:grid-cols-2">{receivers.map((r) => <Card key={r.id}><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>{r.label}</CardTitle><p className="mt-1 text-xs text-muted2">{r.rail.replaceAll("_", " ")} · {r.currency} · {r.country || "Country not set"}</p></div><span className={`rounded-full px-2 py-1 text-xs ${r.enabled ? "bg-emerald-50 text-emerald-700" : "bg-surface text-muted2"}`}>{r.enabled ? "Active" : "Disabled"}</span></div></CardHeader><CardContent className="space-y-4 text-sm">
      <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Beneficiary</div><div className="mt-1 font-medium">{[r.firstName,r.lastName].filter(Boolean).join(" ") || r.legalName}</div>{r.legalName ? <div className="text-xs text-muted2">Legal: {r.legalName}</div> : null}<div className="mt-1 text-xs text-muted2">{[r.phone,r.email].filter(Boolean).join(" · ") || "No phone/email"}</div><AddressLines street={r.receiverStreet || r.address} city={r.city} state={r.receiverState} postal={r.receiverPostalCode} country={r.country}/></div>
      <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Bank</div><div className="mt-1 font-medium">{r.bankName || "No bank configured"}</div><div className="text-xs text-muted2">{[r.accountHolderName,r.accountNumber,r.iban,r.swiftBic,r.routingNumber,r.clabe].filter(Boolean).join(" · ") || "No account identifiers"}</div><AddressLines street={r.bankStreet || r.bankAddress} city={r.bankCity} state={r.bankState} postal={r.bankPostalCode} country={r.bankCountry}/></div>
      <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted2">Fees</div><div className="text-xs text-muted2">{r.feePercent.toFixed(2)}% + {r.currency} {r.feeFixed.toFixed(2)}</div></div>
      {canManage ? <div className="flex gap-2"><Link href={`/app/finance/manual-transfers/receivers/${r.id}/edit`}><Button variant="outline">Edit</Button></Link><form action={toggleManualTransferReceiver.bind(null, r.id)}><Button variant="outline">{r.enabled ? "Disable" : "Enable"}</Button></form></div> : null}
    </CardContent></Card>)}{receivers.length === 0 ? <p className="text-sm text-muted2">No manual transfer receiver configured yet.</p> : null}</div>
  </div>;
}
