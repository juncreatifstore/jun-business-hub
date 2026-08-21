import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getManualTransferReceiver } from "@/lib/finance-manual-transfers";
import { updateManualTransferReceiverV2 } from "@/services/finance-manual-receivers-v2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Building2, CircleDollarSign, UserRound } from "lucide-react";

export const dynamic="force-dynamic";
export default async function ReceiverEditPage({params,searchParams}:{params:{id:string};searchParams:{toast_error?:string}}){
  await requirePermission("SETTINGS_MANAGE");const r=await getManualTransferReceiver(params.id);if(!r)notFound();
  return <div className="max-w-6xl space-y-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-muted2">Manual transfer receiver</p><h1 className="mt-1 text-2xl font-semibold">Edit {r.label}</h1><p className="mt-1 text-sm text-muted2">Use separate street, city, state/province, postal code and country fields so sender instructions are unambiguous. Changes apply to future orders only.</p></div><Link href="/app/finance/manual-transfers/receivers"><Button variant="outline">Back</Button></Link></div>
  {searchParams.toast_error?<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.toast_error}</div>:null}
  <form action={updateManualTransferReceiverV2.bind(null,r.id)} className="space-y-4">
    <Card><CardHeader><CardTitle>Receiver setup</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Label"><Input name="label" required defaultValue={r.label}/></Field><Field label="Rail"><Select name="rail" defaultValue={r.rail}><option value="WESTERN_UNION">Western Union</option><option value="BANK_TRANSFER">Bank transfer</option></Select></Field><Field label="Receiver type"><Select name="receiverType" defaultValue={r.receiverType}><option value="BUSINESS">Business</option><option value="INDIVIDUAL_BUSINESS_REPRESENTATIVE">Authorized business representative</option></Select></Field><Field label="Receiver currency"><Input name="currency" defaultValue={r.currency} maxLength={3} required/></Field></CardContent></Card>

    <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><UserRound className="h-4 w-4"/>Beneficiary information</span></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="First name"><Input name="firstName" defaultValue={r.firstName||""}/></Field>
      <Field label="Last name"><Input name="lastName" defaultValue={r.lastName||""}/></Field>
      <Field label="Legal / business name"><Input name="legalName" defaultValue={r.legalName}/></Field>
      <Field label="Phone"><Input name="phone" defaultValue={r.phone}/></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={r.email}/></Field>
      <Field label="Street / address"><Input name="receiverStreet" defaultValue={r.receiverStreet||r.address||""}/></Field>
      <Field label="City"><Input name="city" defaultValue={r.city}/></Field>
      <Field label="State / province"><Input name="receiverState" defaultValue={r.receiverState||""}/></Field>
      <Field label="Postal code"><Input name="receiverPostalCode" defaultValue={r.receiverPostalCode||""}/></Field>
      <Field label="Country"><Input name="country" defaultValue={r.country}/></Field>
    </CardContent></Card>

    <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><Building2 className="h-4 w-4"/>Bank information</span></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Field label="Bank name"><Input name="bankName" defaultValue={r.bankName}/></Field>
      <Field label="Account holder name"><Input name="accountHolderName" defaultValue={r.accountHolderName||r.legalName}/></Field>
      <Field label="Account number"><Input name="accountNumber" defaultValue={r.accountNumber}/></Field>
      <Field label="IBAN"><Input name="iban" defaultValue={r.iban}/></Field>
      <Field label="SWIFT / BIC"><Input name="swiftBic" defaultValue={r.swiftBic}/></Field>
      <Field label="Routing / ABA"><Input name="routingNumber" defaultValue={r.routingNumber}/></Field>
      <Field label="CLABE"><Input name="clabe" defaultValue={r.clabe}/></Field>
      <Field label="Branch code"><Input name="branchCode" defaultValue={r.branchCode}/></Field>
      <Field label="Bank street / address"><Input name="bankStreet" defaultValue={r.bankStreet||r.bankAddress||""}/></Field>
      <Field label="Bank city"><Input name="bankCity" defaultValue={r.bankCity||""}/></Field>
      <Field label="Bank state / province"><Input name="bankState" defaultValue={r.bankState||""}/></Field>
      <Field label="Bank postal code"><Input name="bankPostalCode" defaultValue={r.bankPostalCode||""}/></Field>
      <Field label="Bank country"><Input name="bankCountry" defaultValue={r.bankCountry||""}/></Field>
    </CardContent></Card>

    <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4"/>Transfer configuration & fees</span></CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field label="Fee %"><Input name="feePercent" type="number" min="0" step="0.01" defaultValue={r.feePercent}/></Field><Field label="Fixed fee"><Input name="feeFixed" type="number" min="0" step="0.01" defaultValue={r.feeFixed}/></Field><div className="md:col-span-2 xl:col-span-4"><Field label="Compliance / special instructions"><Textarea name="complianceNote" rows={4} defaultValue={r.complianceNote}/></Field></div><div className="md:col-span-2 xl:col-span-4"><Button variant="primary">Save receiver changes</Button></div></CardContent></Card>
  </form></div>;
}
