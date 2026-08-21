import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDriveActionContext } from "@/lib/drive-intelligence-actions";
import { getManualTransferReceivers } from "@/lib/finance-manual-transfers";
import { createPaymentDraftFromFile, createRefundRequestFromFile, createExpenseDraftFromFile, createDocumentDraftFromFile, syncAccountingFromAnalyzedFile } from "@/services/drive-intelligence-actions";
import { createManualTransferOrder } from "@/services/finance-manual-transfers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { BookOpen, CircleDollarSign, FilePlus2, ReceiptText, RotateCcw, Send, Sparkles, TriangleAlert } from "lucide-react";

export const dynamic = "force-dynamic";
const EXPENSES = ["AIRFARE","HOTEL","VISA_FEES","MARKETING","SOFTWARE","OFFICE","PAYROLL","PROFESSIONAL_SERVICES","BANK_FEES","TAXES","TRANSPORT","UTILITIES","REFUNDS_COST","OTHER"];

type ClientOption = { id:string; firstName:string; lastName:string; internalId:string };
type CaseOption = { id:string; caseNumber:string; title:string; clientId:string };
type PaymentOption = { id:string; reference:string; clientId:string; amount:unknown; currency:string; status:string };

async function optionalLoad<T>(label:string, loader:()=>Promise<T>, fallback:T, warnings:string[]):Promise<T>{
  try { return await loader(); }
  catch (error) {
    console.error(`[drive-intelligence-actions] ${label} failed`, error);
    warnings.push(label);
    return fallback;
  }
}

export default async function DriveIntelligenceActionsPage({ params, searchParams }: { params: { id: string }; searchParams: { success?: string; error?: string } }) {
  const user = await requireUser();
  if (!can(user, "FILE_READ")) notFound();

  let ctx: Awaited<ReturnType<typeof getDriveActionContext>> = null;
  try { ctx = await getDriveActionContext(params.id); }
  catch (error) {
    console.error("[drive-intelligence-actions] context failed", { fileId: params.id, error });
    return <LoadFailure fileId={params.id} />;
  }
  if (!ctx) notFound();

  const warnings:string[] = [];
  const clients = await optionalLoad<ClientOption[]>("client list", () => prisma.client.findMany({ where:{ archivedAt:null }, orderBy:[{firstName:"asc"},{lastName:"asc"}], take:300, select:{id:true,firstName:true,lastName:true,internalId:true} }), [], warnings);
  const cases = await optionalLoad<CaseOption[]>("case list", () => prisma.case.findMany({ where:{ status:{not:"ARCHIVED"} }, orderBy:{createdAt:"desc"}, take:300, select:{id:true,caseNumber:true,title:true,clientId:true} }), [], warnings);
  const payments = await optionalLoad<PaymentOption[]>("confirmed payment list", async () => (await prisma.payment.findMany({ where:{status:{in:["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"]}}, orderBy:{createdAt:"desc"}, take:200, select:{id:true,reference:true,clientId:true,amount:true,currency:true,status:true} })) as unknown as PaymentOption[], [], warnings);
  const receivers = await optionalLoad("manual receiver list", () => getManualTransferReceivers(true), [], warnings);

  const s = ctx.structured;
  const rawAmount = Number(s.transactionAmount || s.totalAmount || 0);
  const extractedAmount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
  const currency = String(s.currency || ctx.file.payment?.currency || "USD").trim().toUpperCase().slice(0,3) || "USD";
  const defaultClient = ctx.file.clientId || "";
  const defaultCase = ctx.file.caseId || "";
  const selectedPayment = ctx.file.payment?.id || "";
  const linkedClientName = `${ctx.file.client?.firstName || ""} ${ctx.file.client?.lastName || ""}`.trim();
  const payerName = String(s.senderName || linkedClientName || "");

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.18em] text-muted2">Drive intelligence</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold"><Sparkles className="h-7 w-7 text-electric"/>Create from analysis</h1><p className="mt-1 text-sm text-muted2">AI pre-fills operational data from <strong>{ctx.file.name}</strong>. Review values before creating financial or official records.</p></div><Link href="/app/drive" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Back to Drive</Link></div>
    {searchParams.success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.success}</div> : null}
    {searchParams.error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{searchParams.error}</div> : null}
    {warnings.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4"/>Some optional Finance data is temporarily unavailable.</div><p className="mt-1 text-xs">Unavailable: {warnings.join(", ")}. The analysis remains usable and available actions are shown below.</p></div> : null}

    <Card><CardHeader><CardTitle>Extracted data</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
      <Value label="Amount" value={extractedAmount ? `${currency} ${extractedAmount.toFixed(2)}` : "Not confidently extracted"}/><Value label="Reference" value={s.transactionReference || "Not extracted"}/><Value label="Sender" value={s.senderName || "Not extracted"}/><Value label="Beneficiary" value={s.beneficiaryName || "Not extracted"}/><Value label="Sender bank" value={s.senderBank || "Not extracted"}/><Value label="Beneficiary bank" value={s.beneficiaryBank || "Not extracted"}/><Value label="Linked client" value={ctx.file.client ? `${ctx.file.client.firstName} ${ctx.file.client.lastName}` : "Not linked"}/><Value label="Linked case" value={ctx.file.case ? `${ctx.file.case.caseNumber} · ${ctx.file.case.title}` : "Not linked"}/>
    </CardContent></Card>

    <div className="grid gap-4 xl:grid-cols-2">
      {can(user,"PAYMENT_CREATE") ? <ActionCard icon={CircleDollarSign} title="Create Payment draft" subtitle="Creates a PENDING payment. It is not confirmed automatically."><form action={createPaymentDraftFromFile.bind(null, ctx.file.id)} className="grid gap-3 md:grid-cols-2"><ClientFields clients={clients} cases={cases} defaultClient={defaultClient} defaultCase={defaultCase}/><Field label="Amount"><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={extractedAmount || ""} required/></Field><Field label="Currency"><Input name="currency" maxLength={3} defaultValue={currency} required/></Field><div className="md:col-span-2"><Button variant="primary" disabled={!clients.length}>Create PENDING payment</Button>{!clients.length ? <p className="mt-2 text-xs text-amber-700">Client list unavailable. Try again before creating a payment.</p> : null}</div></form></ActionCard> : null}

      {can(user,"REFUND_CREATE") ? <ActionCard icon={RotateCcw} title="Create Refund request" subtitle="Creates a REQUESTED refund. Approval and payout remain separate."><form action={createRefundRequestFromFile.bind(null, ctx.file.id)} className="grid gap-3 md:grid-cols-2"><ClientFields clients={clients} cases={cases} defaultClient={defaultClient} defaultCase={defaultCase}/><Field label="Original payment"><Select name="paymentId" defaultValue={selectedPayment}><option value="">Unlinked refund</option>{payments.map(p=><option key={p.id} value={p.id}>{p.reference} · {p.currency} {Number(p.amount).toFixed(2)}</option>)}</Select></Field><Field label="Amount"><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={extractedAmount || ""}/></Field><Field label="Currency"><Input name="currency" maxLength={3} defaultValue={currency}/></Field><div className="md:col-span-2"><Field label="Reason"><Textarea name="reason" rows={2} defaultValue={ctx.intelligence?.summary || ""}/></Field></div><div className="md:col-span-2"><Button variant="primary" disabled={!clients.length}>Create refund request</Button></div></form></ActionCard> : null}

      {can(user,"EXPENSE_CREATE") ? <ActionCard icon={ReceiptText} title="Create Expense draft" subtitle="Creates an Accounts Payable expense in DRAFT status."><form action={createExpenseDraftFromFile.bind(null, ctx.file.id)} className="grid gap-3 md:grid-cols-2"><input type="hidden" name="clientId" value={defaultClient}/><input type="hidden" name="caseId" value={defaultCase}/><Field label="Vendor"><Input name="vendorName" defaultValue={s.beneficiaryName || s.beneficiaryBank || s.senderBank || ""}/></Field><Field label="Category"><Select name="expenseCategory" defaultValue="OTHER">{EXPENSES.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</Select></Field><Field label="Amount"><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={extractedAmount || ""} required/></Field><Field label="Currency"><Input name="currency" maxLength={3} defaultValue={currency} required/></Field><div className="md:col-span-2"><Field label="Description"><Textarea name="description" rows={2} defaultValue={ctx.intelligence?.summary || ""}/></Field></div><div className="md:col-span-2"><Button variant="primary">Create expense draft</Button></div></form></ActionCard> : null}

      {can(user,"DOCUMENT_CREATE") ? <ActionCard icon={FilePlus2} title="Create Document draft" subtitle="Creates a DRAFT document from the AI summary and extracted facts."><form action={createDocumentDraftFromFile.bind(null, ctx.file.id)} className="space-y-3"><Field label="Document title"><Input name="title" defaultValue={ctx.intelligence?.documentPurpose || `Document from ${ctx.file.name}`}/></Field><Button variant="primary">Create document draft</Button></form></ActionCard> : null}

      {can(user,"PAYMENT_CREATE") ? <ActionCard icon={Send} title="Create Manual Transfer order" subtitle="Uses extracted data and your configured receiver. Existing Manual Transfer controls still apply.">{receivers.length ? <form action={createManualTransferOrder} className="grid gap-3 md:grid-cols-2"><Field label="Receiver"><Select name="receiverId" required><option value="">Select receiver</option>{receivers.map(r=><option key={r.id} value={r.id}>{r.label} · {r.rail.replaceAll("_"," ")}</option>)}</Select></Field><Field label="Payer name"><Input name="payerName" defaultValue={payerName}/></Field><Field label="Amount to send"><Input name="sendAmount" type="number" min="0.01" step="0.01" defaultValue={extractedAmount || ""} required/></Field><Field label="Send currency"><Input name="sendCurrency" defaultValue={currency} maxLength={3}/></Field><Field label="Receive currency"><Input name="receiveCurrency" defaultValue={currency} maxLength={3}/></Field><Field label="Exchange rate"><Input name="exchangeRate" type="number" step="0.0000001" defaultValue="1"/></Field><Field label="Origin country"><Input name="originCountry" defaultValue={s.country || ""}/></Field><Field label="Destination country"><Input name="destinationCountry"/></Field><Field label="Language"><Input name="language" defaultValue={ctx.intelligence?.language || "French"}/></Field><input type="hidden" name="clientId" value={defaultClient}/><input type="hidden" name="caseId" value={defaultCase}/><div className="md:col-span-2"><Field label="Purpose"><Input name="purpose" defaultValue={ctx.intelligence?.documentPurpose || "Commercial payment"}/></Field></div><div className="md:col-span-2"><Button variant="primary">Generate manual payment order</Button></div></form> : <div className="rounded-lg border border-line bg-surface p-3 text-sm text-muted2">No active Manual Transfer receiver is configured yet. <Link href="/app/finance/manual-transfers/receivers" className="font-medium text-electric">Configure a receiver</Link>.</div>}</ActionCard> : null}

      {can(user,"ACCOUNTING_POST") ? <ActionCard icon={BookOpen} title="Update Accounting" subtitle="Synchronizes eligible confirmed Finance events into the immutable accounting ledger. The file itself does not create a journal entry unless a valid Finance event exists."><form action={syncAccountingFromAnalyzedFile.bind(null, ctx.file.id)}><Button variant="outline">Sync Accounting ledger</Button></form></ActionCard> : null}
    </div>

    {ctx.file.payment && ["CONFIRMED","PARTIALLY_REFUNDED","REFUNDED"].includes(ctx.file.payment.status) ? <Card><CardHeader><CardTitle>Receipt</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-muted2">This file is linked to confirmed payment {ctx.file.payment.reference}. The official receipt can be generated from the existing Receipt workflow.</p><Link href={`/app/finance/receipts/${ctx.file.payment.id}`} className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white"><ReceiptText className="h-4 w-4"/>Open / create official receipt</Link></CardContent></Card> : null}

    <p className="text-xs text-muted2">AI extraction is advisory. Financial records are created only through permission-controlled server actions and remain subject to the normal Finance approval workflow.</p>
  </div>;
}

function LoadFailure({fileId}:{fileId:string}){return <div className="mx-auto max-w-2xl py-10"><Card><CardHeader><CardTitle>Analysis actions temporarily unavailable</CardTitle></CardHeader><CardContent><p className="text-sm text-muted2">The file remains safe in Drive. The operational action context could not be loaded. No payment, refund, expense or accounting entry was created.</p><div className="mt-4 flex gap-2"><Link href="/app/drive" className="rounded-lg border border-line px-3 py-2 text-sm">Back to Drive</Link><Link href={`/app/drive/intelligence-actions/${encodeURIComponent(fileId)}`} className="rounded-lg bg-night px-3 py-2 text-sm text-white">Retry</Link></div></CardContent></Card></div>}
function Value({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-line bg-surface p-3"><div className="text-[10px] uppercase tracking-wide text-muted2">{label}</div><div className="mt-1 break-words font-medium">{value}</div></div>}
function ActionCard({icon:Icon,title,subtitle,children}:{icon:typeof Sparkles;title:string;subtitle:string;children:React.ReactNode}){return <Card><CardHeader><CardTitle><span className="flex items-center gap-2"><Icon className="h-4 w-4"/>{title}</span></CardTitle><p className="text-xs text-muted2">{subtitle}</p></CardHeader><CardContent>{children}</CardContent></Card>}
function ClientFields({clients,cases,defaultClient,defaultCase}:{clients:ClientOption[];cases:CaseOption[];defaultClient:string;defaultCase:string}){return <><Field label="Client"><Select name="clientId" defaultValue={defaultClient} required><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.firstName} {c.lastName} · {c.internalId}</option>)}</Select></Field><Field label="Case"><Select name="caseId" defaultValue={defaultCase}><option value="">No case</option>{cases.map(c=><option key={c.id} value={c.id}>{c.caseNumber} · {c.title}</option>)}</Select></Field></>}
