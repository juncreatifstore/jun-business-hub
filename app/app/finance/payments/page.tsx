import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/utils";
import { getPaymentCoreMetaMap, paymentBalance } from "@/lib/finance-payment-core";
import { CircleDollarSign, Clock3, CreditCard, FileCheck2, Search } from "lucide-react";

export const dynamic = "force-dynamic";
const STATUSES = ["PENDING","CONFIRMED","REJECTED","REFUNDED","PARTIALLY_REFUNDED"];
const METHODS = ["ZELLE","STRIPE","PAYPAL","MERCADO_PAGO","BANK_TRANSFER","CASH","MONCASH","OTHER"];
function roundMoney(value:number){return Math.round((value+Number.EPSILON)*100)/100;}
function netReceived(amount:number,feeAmount?:number|null){return Math.max(0,roundMoney(amount-Number(feeAmount||0)));}

export default async function PaymentsPage({searchParams}:{searchParams:{status?:string;method?:string;currency?:string;q?:string}}){
  await requirePermission("PAYMENT_READ");
  const status=STATUSES.includes(String(searchParams.status))?String(searchParams.status):"ALL";
  const method=METHODS.includes(String(searchParams.method))?String(searchParams.method):"ALL";
  const currency=String(searchParams.currency||"").trim().toUpperCase().slice(0,3);
  const q=String(searchParams.q||"").trim();
  const where:any={...(status!=="ALL"?{status}:{}),...(method!=="ALL"?{method}:{}),...(currency?{currency}:{}),...(q?{OR:[{reference:{contains:q,mode:"insensitive"}},{providerRef:{contains:q,mode:"insensitive"}},{client:{firstName:{contains:q,mode:"insensitive"}}},{client:{lastName:{contains:q,mode:"insensitive"}}},{client:{internalId:{contains:q,mode:"insensitive"}}},{case:{caseNumber:{contains:q,mode:"insensitive"}}}]}:{})};
  const [payments,pendingCount,confirmedPayments,proofCount]=await Promise.all([
    prisma.payment.findMany({where,orderBy:[{paidAt:"desc"},{createdAt:"desc"}],take:200,include:{client:true,case:true,files:{where:{category:"PAYMENT_PROOF",archivedAt:null},select:{id:true}}}}),
    prisma.payment.count({where:{status:"PENDING"}}),
    prisma.payment.findMany({where:{status:"CONFIRMED"},select:{id:true,amount:true,currency:true}}),
    prisma.file.count({where:{isVault:false,archivedAt:null,category:"PAYMENT_PROOF",paymentId:{not:null}}}),
  ]);
  const allMetaIds=[...new Set([...payments.map(p=>p.id),...confirmedPayments.map(p=>p.id)])];
  const metaMap=await getPaymentCoreMetaMap(allMetaIds);
  const totals=new Map<string,number>();
  for(const p of confirmedPayments){const meta=metaMap.get(p.id);const net=netReceived(Number(p.amount),meta?.feeAmount);totals.set(p.currency,roundMoney((totals.get(p.currency)||0)+net));}
  const collected=totals.size?[...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([cur,total])=>`${cur} ${total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`).join(" · "):"—";

  return <div>
    <PageHeader title="Paiements" subtitle="Registre financier des encaissements, validations, soldes, preuves et reçus." actionHref="/app/finance/payments/new" actionLabel="Enregistrer un paiement" />
    <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={CircleDollarSign} label="Encaissements confirmés" value={collected} hint={`${confirmedPayments.length} paiements · net après frais`} />
      <Metric icon={Clock3} label="En attente" value={String(pendingCount)} hint="À valider par la finance" />
      <Metric icon={FileCheck2} label="Preuves de paiement" value={String(proofCount)} hint="Pièces liées aux paiements" />
      <Metric icon={CreditCard} label="Résultats affichés" value={String(payments.length)} hint="Jusqu’à 200 enregistrements" />
    </div>
    <form className="mb-5 grid gap-2 rounded-2xl border border-line bg-night-soft/45 p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_170px_180px_120px_auto]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted2"/><Input name="q" defaultValue={q} placeholder="Référence, client, dossier, transaction…" className="pl-9"/></div>
      <Select name="status" defaultValue={status}><option value="ALL">Tous les statuts</option>{STATUSES.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</Select>
      <Select name="method" defaultValue={method}><option value="ALL">Toutes les méthodes</option>{METHODS.map(m=><option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}</Select>
      <Input name="currency" defaultValue={currency} placeholder="Devise" maxLength={3}/><Button variant="outline">Appliquer</Button>
    </form>
    {payments.length===0?<EmptyState icon={CreditCard} title="Aucun paiement correspondant" description="Modifiez les filtres ou enregistrez un nouveau paiement." actionHref="/app/finance/payments/new" actionLabel="Enregistrer un paiement"/>:<Table>
      <THead><tr><TH>Référence</TH><TH>Client / service</TH><TH>Net reçu</TH><TH>Attendu / solde</TH><TH>Méthode</TH><TH>Preuve</TH><TH>Statut</TH><TH>Date</TH></tr></THead>
      <tbody>{payments.map(p=>{const meta=metaMap.get(p.id);const expected=meta?.expectedAmount??null;const grossAmount=Number(p.amount);const feeAmount=Number(meta?.feeAmount||0);const netAmount=netReceived(grossAmount,feeAmount);const balance=paymentBalance(netAmount,expected);return <TR key={p.id}>
        <TD><Link href={`/app/finance/payments/${p.id}`} className="registry-id hover:text-electric">{p.reference}</Link>{p.providerRef?<div className="mt-1 max-w-40 truncate text-[11px] text-muted2">{p.providerRef}</div>:null}</TD>
        <TD><Link href={`/app/clients/${p.clientId}`} className="font-medium hover:text-electric">{p.client.firstName} {p.client.lastName}</Link><div className="mt-1 text-[11px] text-muted2">{meta?.serviceLabel||p.case?.caseNumber||"Service non précisé"}</div></TD>
        <TD className="font-medium"><div>{formatMoney(netAmount,p.currency)}</div>{feeAmount>0?<div className="mt-1 text-[11px] font-normal text-muted2">Brut {formatMoney(grossAmount,p.currency)} · frais {formatMoney(feeAmount,p.currency)}</div>:null}</TD>
        <TD>{expected==null?<span className="text-muted2">—</span>:<><div>{formatMoney(expected,p.currency)}</div><div className={`text-[11px] ${balance&&balance>0?"text-amber-400":"text-emerald-400"}`}>{balance&&balance>0?`${formatMoney(balance,p.currency)} dû`:balance&&balance<0?`${formatMoney(Math.abs(balance),p.currency)} trop-perçu`:"Payé intégralement"}</div></>}</TD>
        <TD className="text-muted2">{p.method.replaceAll("_"," ")}</TD><TD>{p.files.length?<span className="text-xs font-medium text-emerald-400">{p.files.length} jointe(s)</span>:<span className="text-xs text-muted2">Manquante</span>}</TD><TD><StatusBadge status={p.status}/></TD><TD className="text-muted2">{formatDate(p.paidAt)}</TD>
      </TR>;})}</tbody>
    </Table>}
  </div>;
}
function Metric({icon:Icon,label,value,hint}:{icon:typeof CreditCard;label:string;value:string;hint:string}){return <div className="rounded-2xl border border-line bg-night-soft/45 p-4 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/10 text-electric"><Icon className="h-4 w-4"/></span><div className="mt-4 text-xs text-muted2">{label}</div><div className="mt-1 text-lg font-semibold text-ink">{value}</div><div className="mt-1 text-xs text-muted2">{hint}</div></div>;}
