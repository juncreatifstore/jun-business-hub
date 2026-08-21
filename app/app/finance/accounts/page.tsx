import { requirePermission, can } from "@/lib/auth";
import { getFinancePaymentAccounts } from "@/lib/finance-payment-accounts";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { createFinancePaymentAccount, toggleFinancePaymentAccount, updateFinancePaymentAccount } from "@/services/finance-payment-accounts";
import { CreditCard, Landmark, Power, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

const METHODS = ["ZELLE","STRIPE","PAYPAL","MERCADO_PAGO","BANK_TRANSFER","CASH","MONCASH","OTHER"];

export default async function PaymentAccountsPage() {
  const user = await requirePermission("PAYMENT_READ");
  const accounts = await getFinancePaymentAccounts();
  const canManage = can(user, "SETTINGS_MANAGE");
  const active = accounts.filter((a) => a.enabled).length;
  const currencies = [...new Set(accounts.map((a) => a.currency))].length;

  return <div>
    <PageHeader title="Payment Accounts" subtitle="Control where payments are received, which methods are operational, and the fees attached to each receiving account." />

    <div className="mb-5 grid gap-3 md:grid-cols-3">
      <Stat icon={WalletCards} label="Configured accounts" value={String(accounts.length)} />
      <Stat icon={Power} label="Active accounts" value={String(active)} />
      <Stat icon={Landmark} label="Currencies" value={String(currencies)} />
    </div>

    {canManage ? <Card className="mb-5">
      <CardHeader><CardTitle>Add receiving account</CardTitle></CardHeader>
      <CardContent>
        <form action={createFinancePaymentAccount} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Account label"><Input name="label" placeholder="Zelle USD — Main" required /></Field>
          <Field label="Method"><Select name="method" defaultValue="ZELLE">{METHODS.map((m) => <option key={m} value={m}>{m.replaceAll("_", " ")}</option>)}</Select></Field>
          <Field label="Currency"><Input name="currency" defaultValue="USD" maxLength={3} required /></Field>
          <Field label="Receiver / holder"><Input name="receiverName" placeholder="Company or account holder" /></Field>
          <div className="md:col-span-2"><Field label="Account descriptor"><Input name="accountDescriptor" placeholder="Email, phone, bank + last 4 digits, cash drawer…" /></Field></div>
          <Field label="Fee %"><Input name="feePercent" type="number" min="0" max="100" step="0.01" defaultValue="0" /></Field>
          <Field label="Fixed fee"><Input name="feeFixed" type="number" min="0" step="0.01" defaultValue="0" /></Field>
          <div className="md:col-span-2 xl:col-span-4"><Field label="Internal instructions"><Textarea name="instructions" rows={3} placeholder="How the finance team verifies this account. Do not store API keys or passwords here." /></Field></div>
          <div className="md:col-span-2 xl:col-span-4"><Button variant="primary">Add account</Button></div>
        </form>
      </CardContent>
    </Card> : null}

    <div className="space-y-3">
      {accounts.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted2">No receiving accounts configured yet.</CardContent></Card> : accounts.map((account) => <Card key={account.id}>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{account.label}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${account.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{account.enabled ? "ACTIVE" : "DISABLED"}</span></div>
              <p className="mt-1 text-xs text-muted2">{account.method.replaceAll("_", " ")} · {account.currency}{account.receiverName ? ` · ${account.receiverName}` : ""}</p>
              {account.accountDescriptor ? <p className="mt-1 text-sm">{account.accountDescriptor}</p> : null}
              <p className="mt-2 text-xs text-muted2">Fees: {account.feePercent.toFixed(2)}% + {account.currency} {account.feeFixed.toFixed(2)}</p>
              {account.instructions ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-xs text-muted2">{account.instructions}</p> : null}
            </div>
            {canManage ? <form action={toggleFinancePaymentAccount.bind(null, account.id)}><Button variant={account.enabled ? "outline" : "primary"}>{account.enabled ? "Disable" : "Enable"}</Button></form> : null}
          </div>
          {canManage ? <details className="mt-4 rounded-lg border border-line bg-surface p-3"><summary className="cursor-pointer text-xs font-medium">Edit account details & fees</summary><form action={updateFinancePaymentAccount.bind(null, account.id)} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Label"><Input name="label" defaultValue={account.label} required /></Field><Field label="Receiver"><Input name="receiverName" defaultValue={account.receiverName} /></Field><div className="md:col-span-2"><Field label="Account descriptor"><Input name="accountDescriptor" defaultValue={account.accountDescriptor} /></Field></div><Field label="Fee %"><Input name="feePercent" type="number" min="0" max="100" step="0.01" defaultValue={String(account.feePercent)} /></Field><Field label="Fixed fee"><Input name="feeFixed" type="number" min="0" step="0.01" defaultValue={String(account.feeFixed)} /></Field><div className="md:col-span-2"><Field label="Internal instructions"><Textarea name="instructions" rows={2} defaultValue={account.instructions} /></Field></div><div className="md:col-span-2 xl:col-span-4"><Button variant="outline">Save changes</Button></div></form></details> : null}
        </CardContent>
      </Card>)}
    </div>
  </div>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><Icon className="mb-2 h-5 w-5 text-electric" /><div className="text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
