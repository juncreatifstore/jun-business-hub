import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatMoney } from "@/lib/utils";
import { refundPaidTotal, refundRemaining } from "@/lib/finance-refund-workflow";
import { syncOverdueRefundInstallments } from "@/lib/finance-refund-installments";
import { AlertTriangle, CheckCircle2, Clock3, SearchCheck, Undo2, WalletCards } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RefundsPage(){
  await requirePermission("REFUND_READ");
  await syncOverdueRefundInstallments();
  const refunds=await prisma.refund.findMany({orderBy:{createdAt:"desc"},take:150,include:{client:true,payment:{select:{reference:true}},installments:{orderBy:{dueDate:"asc"}},files:{where:{archivedAt:null},select:{id:true}}}});
  const review=refunds.filter(r=>["REQUESTED","UNDER_REVIEW"].includes(r.status)).length;
  const approved=refunds.filter(r=>r.status==="APPROVED").length;
  const paying=refunds.filter(r=>r.status==="PARTIALLY_PAID").length;
  const completed=refunds.filter(r=>r.status==="PAID").length;
  const overdue=refunds.reduce((sum,r)=>sum+r.installments.filter(i=>i.status==="LATE").length,0);
  const activeStatuses=new Set(["REQUESTED","UNDER_REVIEW","APPROVED","PARTIALLY_PAID"]);
  const activeByPayment=new Map<string,number>();
  for(const r of refunds)if(r.paymentId&&activeStatuses.has(r.status))activeByPayment.set(r.paymentId,(activeByPayment.get(r.paymentId)||0)+1);
  const duplicateGroups=[...activeByPayment.values()].filter(count=>count>1).length;
  const globalBalanceActive=refunds.filter(r=>!r.paymentId&&activeStatuses.has(r.status)).length;

  return <div>
    <PageHeader title="Remboursements" subtitle="Workflow contrôlé des demandes, validations, échéanciers, décaissements et rapprochements." actionHref="/app/finance/refunds/new" actionLabel="Nouveau remboursement" />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric icon={SearchCheck} label="À réviser" value={review}/><Metric icon={Clock3} label="Approuvés / à payer" value={approved}/><Metric icon={WalletCards} label="Partiellement payés" value={paying}/><Metric icon={AlertTriangle} label="Échéances en retard" value={overdue}/><Metric icon={CheckCircle2} label="Terminés" value={completed}/></div>
    {duplicateGroups>0?<div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-4 text-sm"><div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400"><AlertTriangle className="h-4 w-4"/></span><div><div className="font-medium text-amber-300">Rapprochement à vérifier</div><div className="mt-1 text-amber-200/80">{duplicateGroups} paiement(s) d’origine possèdent plusieurs demandes de remboursement actives.</div><div className="mt-1 text-xs text-amber-200/55">Les demandes annulées ou rejetées ne sont pas comptées comme doublons actifs.</div></div></div></div>:null}
    {globalBalanceActive>0?<div className="mb-5 rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] px-4 py-3 text-xs text-blue-200"><strong>{globalBalanceActive} demande(s) active(s)</strong> utilisent le solde global du client et ne nécessitent volontairement pas de paiement d’origine.</div>:null}
    {refunds.length===0?<EmptyState icon={Undo2} title="Aucun remboursement" description="Les demandes de remboursement apparaîtront ici dès leur création." actionHref="/app/finance/refunds/new" actionLabel="Créer une demande"/>:<Table>
      <THead><tr><TH>Référence</TH><TH>Client</TH><TH>Source</TH><TH>Demandé</TH><TH>Payé / restant</TH><TH>Prochaine échéance</TH><TH>Statut</TH><TH>Créé</TH></tr></THead>
      <tbody>{refunds.map(r=>{const paid=refundPaidTotal(r.installments);const remaining=refundRemaining(r.amount,r.installments);const open=r.installments.filter(i=>!["PAID","CANCELLED"].includes(i.status));const next=open[0]||null;const late=r.installments.filter(i=>i.status==="LATE").length;const possibleDuplicate=Boolean(r.paymentId&&activeStatuses.has(r.status)&&(activeByPayment.get(r.paymentId)||0)>1);const nextLabel=r.status==="PAID"?"Terminé":r.status==="CANCELLED"?"Annulé":r.status==="REJECTED"?"Rejeté":"Aucun échéancier";return <TR key={r.id}>
        <TD><Link href={`/app/finance/refunds/${r.id}`} className="registry-id hover:text-electric">{r.refundNumber}</Link>{possibleDuplicate?<div className="mt-1"><Badge className="border border-red-500/20 bg-red-500/10 text-red-300">DOUBLON POSSIBLE</Badge></div>:null}</TD>
        <TD><Link href={`/app/clients/${r.clientId}`} className="font-medium hover:text-electric">{r.client.firstName} {r.client.lastName}</Link></TD>
        <TD>{r.payment?<div><span className="registry-id">{r.payment.reference}</span><div className="mt-1 text-[11px] text-muted2">Paiement spécifique</div></div>:<div><Badge className="border border-blue-500/20 bg-blue-500/10 text-blue-300">SOLDE GLOBAL</Badge><div className="mt-1 text-[11px] text-muted2">Aucun lien paiement requis</div></div>}</TD>
        <TD className="font-medium">{formatMoney(Number(r.amount),r.currency)}</TD>
        <TD><div className="text-sm">{formatMoney(paid,r.currency)} payé</div><div className="text-xs text-muted2">{formatMoney(remaining,r.currency)} restant</div></TD>
        <TD>{next?<div><div className={late?"font-medium text-amber-400":"text-sm"}>{formatDate(next.dueDate)}</div><div className="text-xs text-muted2">{formatMoney(Number(next.amount),r.currency)}{late?` · ${late} retard`:""}</div></div>:<span className="text-muted2">{nextLabel}</span>}</TD>
        <TD><StatusBadge status={r.status}/></TD><TD className="text-muted2">{formatDate(r.createdAt)}</TD>
      </TR>;})}</tbody>
    </Table>}
  </div>;
}
function Metric({icon:Icon,label,value}:{icon:typeof SearchCheck;label:string;value:number}){return <div className="rounded-2xl border border-line bg-night-soft/45 p-4 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-electric/10 text-electric"><Icon className="h-4 w-4"/></span><div className="mt-4 text-xs text-muted2">{label}</div><div className="mt-1 text-2xl font-semibold text-ink">{value}</div></div>;}
