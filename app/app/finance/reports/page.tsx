import { requirePermission } from "@/lib/auth";
import { getFinanceControlCenter } from "@/lib/finance-control-center";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";
import { Download, WalletCards, ReceiptText, RotateCcw, Landmark } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requirePermission("PAYMENT_READ");
  const data = await getFinanceControlCenter();
  const currencyCount=data.currencies.length;
  const methodCount=data.methods.length;
  const paymentCount=data.currencies.reduce((sum,row)=>sum+row.paymentCount,0);
  return <div>
    <PageHeader title="Rapports financiers" subtitle="Encaissements, frais, remboursements et position de trésorerie multi-devises. Les devises ne sont jamais additionnées artificiellement." />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={WalletCards} label="Devises suivies" value={String(currencyCount)} />
      <Metric icon={ReceiptText} label="Paiements confirmés" value={String(paymentCount)} />
      <Metric icon={Landmark} label="Méthodes actives" value={String(methodCount)} />
      <Metric icon={RotateCcw} label="Période" value="Temps réel" />
    </div>
    <div className="mb-5 flex justify-end"><a href="/api/finance/export.csv" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#101827] px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/[0.05]"><Download className="h-4 w-4"/>Exporter CSV finance</a></div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.currencies.map((row)=><Card key={row.currency}><CardHeader><CardTitle className="flex items-center justify-between"><span>{row.currency}</span><span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-300">{row.paymentCount} paiement{row.paymentCount===1?"":"s"}</span></CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><Line label="Encaissements" value={formatMoney(row.collected,row.currency)}/><Line label="Frais estimés" value={formatMoney(row.fees,row.currency)}/><Line label="Remboursements payés" value={formatMoney(row.refundsPaid,row.currency)}/><div className="border-t border-white/[0.06] pt-3"><Line label="Cash net" value={formatMoney(row.netCash,row.currency)} strong/></div></CardContent></Card>)}
    </div>

    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Mois en cours</CardTitle></CardHeader><CardContent className="space-y-2">{data.monthCurrencies.length?data.monthCurrencies.map((row)=><div key={row.currency} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="mb-2 registry-id text-blue-300">{row.currency}</div><Line label="Encaissements après frais" value={formatMoney(row.collected,row.currency)}/><Line label="Remboursements" value={formatMoney(row.refunds,row.currency)}/><Line label="Mouvement net" value={formatMoney(row.net,row.currency)} strong/></div>):<p className="text-sm text-muted2">Aucun mouvement ce mois-ci.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Méthodes de paiement</CardTitle></CardHeader><CardContent className="space-y-2">{data.methods.length?data.methods.map((row)=><div key={row.method} className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-200">{row.method.replaceAll("_"," ")}</span><span className="text-xs text-muted2">{row.count} paiement{row.count===1?"":"s"}</span></div><div className="mt-2 space-y-1 text-xs text-slate-400">{Object.entries(row.amountByCurrency).map(([currency,amount])=><div key={currency}>{formatMoney(amount,currency)}</div>)}</div></div>):<p className="text-sm text-muted2">Aucun paiement confirmé.</p>}</CardContent></Card>
    </div>
  </div>;
}
function Metric({icon:Icon,label,value}:{icon:typeof WalletCards;label:string;value:string}){return <div className="rounded-2xl border border-white/[0.07] bg-[#101827] p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted2">{label}</span><Icon className="h-4 w-4 text-blue-400"/></div><div className="mt-2 text-xl font-semibold text-white">{value}</div></div>}
function Line({label,value,strong=false}:{label:string;value:string;strong?:boolean}){return <div className="flex items-center justify-between gap-3"><span className="text-muted2">{label}</span><span className={strong?"font-semibold text-white":"font-medium text-slate-300"}>{value}</span></div>}
