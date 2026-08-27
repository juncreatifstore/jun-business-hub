import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCurrentUser } from "@/lib/auth";
import { getMonthlyFinancialClose } from "@/lib/company-funds-monthly-close";

export const dynamic = "force-dynamic";

function money(value:number,currency:string){return `${currency} ${Number(value||0).toFixed(2)}`}
function clean(value:unknown){return String(value??"").replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,"-").replace(/[^\x20-\x7E\u00C0-\u00FF]/g,"?")}

export async function GET(_request:Request,{params}:{params:{period:string}}){
  const user=await getCurrentUser();
  if(!user||user.role!=="SUPER_ADMIN")return NextResponse.json({ok:false,error:"Forbidden"},{status:403});
  const close=await getMonthlyFinancialClose(params.period);
  if(!close)return NextResponse.json({ok:false,error:"Monthly close not found"},{status:404});

  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize:[number,number]=[595.28,841.89];
  let page=pdf.addPage(pageSize);let y=800;
  const draw=(text:string,size=9,isBold=false,indent=0)=>{
    const font=isBold?bold:regular;const safe=clean(text);const max=100;
    const chunks:string[]=[];let remaining=safe;
    while(remaining.length>max){let cut=remaining.lastIndexOf(" ",max);if(cut<30)cut=max;chunks.push(remaining.slice(0,cut));remaining=remaining.slice(cut).trimStart()}chunks.push(remaining);
    for(const line of chunks){if(y<48){page=pdf.addPage(pageSize);y=800}page.drawText(line,{x:42+indent,y,size,font,color:rgb(0.08,0.1,0.14)});y-=size+5}
  };
  const rule=()=>{if(y<55){page=pdf.addPage(pageSize);y=800}page.drawLine({start:{x:42,y},end:{x:553,y},thickness:.5,color:rgb(.8,.82,.85)});y-=12};

  draw("JUN CREATIF AND TRAVEL LLC",15,true);draw("RAPPORT OFFICIEL DE CLOTURE FINANCIERE MENSUELLE",12,true);draw(`Periode: ${close.period} | Statut: ${close.status}`,10,true);draw(`Cloture: ${new Date(close.closedAt).toISOString()} | ID: ${close.id}`,8);if(close.closeNote)draw(`Note: ${close.closeNote}`,8);if(close.reopenedAt)draw(`Reouverture: ${new Date(close.reopenedAt).toISOString()} | Motif: ${close.reopenReason||"-"}`,8);rule();

  draw("RESULTAT FINANCE PAR DEVISE",10,true);
  if(!close.snapshot.financeByCurrency.length)draw("Aucun flux Finance JUN pour cette periode.",8);
  for(const r of close.snapshot.financeByCurrency){draw(`${r.currency} | Entrees ${money(r.income,r.currency)} | Remboursements ${money(r.refunds,r.currency)} | Depenses ${money(r.expenses,r.currency)} | Frais ${money(r.fees,r.currency)} | Net ${money(r.net,r.currency)} | ${r.entryCount} flux`,8)}
  rule();

  draw("COMPTES ET SOLDES AU SNAPSHOT",10,true);
  for(const a of close.snapshot.accounts)draw(`${a.name} | ${a.institution} | ${a.country} | ${money(a.balance,a.currency)}`,8);
  rule();

  draw("RESERVES FINANCIERES",10,true);
  for(const r of close.snapshot.reserves)draw(`${r.name} | ${r.kind} | ${r.country||"Global"} | Reserve ${money(r.reservedAmount,r.currency)} / Objectif ${money(r.targetAmount,r.currency)}`,8);
  rule();

  draw("PRETS",10,true);
  for(const l of close.snapshot.loans)draw(`${l.lender} | ${l.status} | Principal ${money(l.principal,l.currency)} | Solde ${money(l.outstandingBalance,l.currency)} | Taux ${l.interestRate}% | Echeance ${l.dueDate||"-"}`,8);
  rule();

  draw("INVESTISSEMENTS",10,true);
  for(const i of close.snapshot.investments)draw(`${i.name} | ${i.country} | ${i.status} | ${money(i.amount,i.currency)}`,8);
  rule();
  draw("Controle d'integrite",9,true);draw("Ce document est genere depuis le snapshot immuable conserve par JUN au moment de la cloture. Toute correction posterieure exige la reouverture auditee de la periode.",8);
  draw(`Genere le ${new Date().toISOString()} par ${user.firstName} ${user.lastName} (${user.role})`,8);

  const bytes=await pdf.save();
  return new NextResponse(Buffer.from(bytes),{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="JUN-cloture-${close.period}.pdf"`,`Cache-Control":"no-store"`}});
}
