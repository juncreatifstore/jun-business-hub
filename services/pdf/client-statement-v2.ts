import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { buildFinanceDocumentVerificationUrl, registerFinanceDocumentVerification } from "@/lib/finance-document-verification";

const W=595.28,H=841.89,M=42;
const INK=rgb(.055,.09,.16),MUTED=rgb(.40,.45,.55),LINE=rgb(.86,.88,.92),SOFT=rgb(.965,.97,.98),RED=rgb(.72,.10,.12),REDBG=rgb(.995,.94,.94);

type Balance={currency:string;confirmedFunds:number;commissions:number;committedExpenses:number;activeRefunds:number;partnerWithdrawals:number;available:number};
type Entry={date:Date;type:string;reference:string;description:string;status:string;currency:string;credit:number;debit:number;runningBalance:number};

type Input={reference:string;language:"FR"|"EN"|"ES"|"HT";client:{name:string;internalId:string;email?:string|null;phone?:string|null;address?:string|null;country?:string|null};balances:Balance[];entries:Entry[]};

function safe(v:unknown){return String(v??"").replace(/[–—]/g,"-").replace(/[^\x20-\x7EÀ-ÿ]/g," ").replace(/\s+/g," ").trim()}
function money(v:number,currency:string){try{return new Intl.NumberFormat("en-US",{style:"currency",currency,minimumFractionDigits:2}).format(v)}catch{return `${currency} ${v.toFixed(2)}`}}
function wrap(text:string,font:PDFFont,size:number,width:number){const out:string[]=[];let line="";for(const word of safe(text).split(/\s+/)){const probe=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(probe,size)<=width)line=probe;else{if(line)out.push(line);line=word}}if(line)out.push(line);return out.length?out:[""]}

export async function renderClientStatementV2(input:Input){
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page:PDFPage=pdf.addPage([W,H]);let y=H-M;let pageNo=1;
 const locale=input.language==="FR"?"fr-FR":input.language==="ES"?"es-MX":input.language==="HT"?"fr-HT":"en-US";
 const t={
  FR:{title:"Relevé de compte client",summary:"Résumé financier",funds:"Fonds nets reçus",comm:"Commissions",expenses:"Dépenses engagées",refunds:"Remboursements engagés",withdrawals:"Retraits",available:"Solde après engagements",due:"SOLDE À RÉGULARISER",dueText:"Le compte présente un solde négatif. Ce montant doit être régularisé avant l'ouverture ou le traitement d'un nouveau service.",history:"Historique détaillé",date:"Date",type:"Type",ref:"Référence",desc:"Description",status:"Statut",debit:"Débit",credit:"Crédit",balance:"Solde"},
  EN:{title:"Client account statement",summary:"Financial summary",funds:"Net funds received",comm:"Commissions",expenses:"Committed expenses",refunds:"Committed refunds",withdrawals:"Withdrawals",available:"Balance after commitments",due:"BALANCE DUE",dueText:"The account has a negative balance. This amount must be settled before a new service can be opened or processed.",history:"Detailed history",date:"Date",type:"Type",ref:"Reference",desc:"Description",status:"Status",debit:"Debit",credit:"Credit",balance:"Balance"},
  ES:{title:"Estado de cuenta del cliente",summary:"Resumen financiero",funds:"Fondos netos recibidos",comm:"Comisiones",expenses:"Gastos comprometidos",refunds:"Reembolsos comprometidos",withdrawals:"Retiros",available:"Saldo después de compromisos",due:"SALDO PENDIENTE",dueText:"La cuenta presenta un saldo negativo. Este monto debe regularizarse antes de abrir o procesar un nuevo servicio.",history:"Historial detallado",date:"Fecha",type:"Tipo",ref:"Referencia",desc:"Descripción",status:"Estado",debit:"Débito",credit:"Crédito",balance:"Saldo"},
  HT:{title:"Relve kont kliyan",summary:"Rezime finansye",funds:"Lajan net resevwa",comm:"Komisyon",expenses:"Depans angaje",refunds:"Ranbousman angaje",withdrawals:"Retrè",available:"Balans apre angajman",due:"BALANS POU REGLE",dueText:"Kont lan negatif. Kliyan an dwe regle montan sa a anvan yon nouvo sèvis kapab louvri oswa trete.",history:"Istwa detaye",date:"Dat",type:"Kalite",ref:"Referans",desc:"Deskripsyon",status:"Estati",debit:"Sòti",credit:"Antre",balance:"Balans"}
 }[input.language];

 const footer=()=>{page.drawLine({start:{x:M,y:31},end:{x:W-M,y:31},thickness:.5,color:LINE});page.drawText(`JUN CREATIF AND TRAVEL LLC · www.juncreatif.org`,{x:M,y:18,size:7,font,color:MUTED});const s=`${input.reference} · Page ${pageNo}`;page.drawText(s,{x:W-M-font.widthOfTextAtSize(s,7),y:18,size:7,font,color:MUTED})};
 const newPage=()=>{footer();page=pdf.addPage([W,H]);pageNo++;y=H-M;page.drawText("JUN CREATIF AND TRAVEL LLC",{x:M,y,size:9,font:bold,color:INK});y-=20};
 const need=(h:number)=>{if(y-h<45)newPage()};
 const section=(label:string)=>{need(35);y-=5;page.drawText(label,{x:M,y,size:14,font:bold,color:INK});y-=10;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.6,color:LINE});y-=18};

 page.drawText("JUN CREATIF AND TRAVEL LLC",{x:M,y,size:10,font:bold,color:INK});page.drawText("www.juncreatif.org",{x:W-M-font.widthOfTextAtSize("www.juncreatif.org",9),y,size:9,font,color:MUTED});y-=19;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.2,color:INK});y-=28;
 const verifyUrl=buildFinanceDocumentVerificationUrl(input.reference);const qr=await pdf.embedPng(await QRCode.toBuffer(verifyUrl,{margin:0,width:220,errorCorrectionLevel:"M"}));page.drawImage(qr,{x:W-M-56,y:y-50,width:54,height:54});
 page.drawText(t.title,{x:M,y,size:25,font:bold,color:INK});y-=29;page.drawText(input.reference,{x:M,y,size:8.5,font,color:MUTED});y-=28;
 page.drawText("CLIENT",{x:M,y,size:7,font:bold,color:MUTED});page.drawText("ACCOUNT",{x:315,y,size:7,font:bold,color:MUTED});y-=15;page.drawText(input.client.name,{x:M,y,size:11,font:bold,color:INK});page.drawText(input.client.internalId,{x:315,y,size:11,font:bold,color:INK});y-=35;
 page.drawText("CONTACT",{x:M,y,size:7,font:bold,color:MUTED});page.drawText("ADDRESS",{x:315,y,size:7,font:bold,color:MUTED});y-=15;page.drawText(safe([input.client.email,input.client.phone].filter(Boolean).join(" · ")||"-"),{x:M,y,size:9,font,color:INK});page.drawText(safe([input.client.address,input.client.country].filter(Boolean).join(", ")||"-"),{x:315,y,size:9,font,color:INK});y-=36;

 section(t.summary);
 for(const b of input.balances){need(135);page.drawRectangle({x:M,y:y-105,width:W-M*2,height:112,borderColor:LINE,borderWidth:.7});page.drawText(b.currency,{x:M+12,y:y-12,size:8,font:bold,color:MUTED});const balanceColor=b.available<0?RED:INK;page.drawText(money(b.available,b.currency),{x:M+12,y:y-38,size:20,font:bold,color:balanceColor});page.drawText(t.available,{x:M+12,y:y-53,size:7.5,font,color:MUTED});
  const vals=[[t.funds,b.confirmedFunds],[t.comm,b.commissions],[t.expenses,-b.committedExpenses],[t.refunds,-b.activeRefunds],[t.withdrawals,-b.partnerWithdrawals]] as const;vals.forEach((r,i)=>{const yy=y-13-i*16;page.drawText(r[0],{x:292,y:yy,size:7.5,font,color:MUTED});const mv=money(r[1],b.currency);page.drawText(mv,{x:W-M-10-font.widthOfTextAtSize(mv,7.5),y:yy,size:7.5,font:Math.abs(r[1])>0?bold:font,color:r[1]<0?RED:INK})});y-=122;
  if(b.available<0){need(72);page.drawRectangle({x:M,y:y-54,width:W-M*2,height:60,color:REDBG,borderColor:RED,borderWidth:.8});page.drawText(`${t.due}: ${money(Math.abs(b.available),b.currency)}`,{x:M+12,y:y-15,size:11,font:bold,color:RED});const lines=wrap(t.dueText,font,8.2,W-M*2-24);lines.slice(0,3).forEach((l,i)=>page.drawText(l,{x:M+12,y:y-31-i*10,size:8.2,font,color:INK}));y-=70;}
 }

 section(t.history);
 const widths=[54,46,70,155,58,55,55,60],headers=[t.date,t.type,t.ref,t.desc,t.status,t.debit,t.credit,t.balance];
 const drawHead=()=>{need(26);page.drawRectangle({x:M,y:y-18,width:widths.reduce((a,b)=>a+b,0),height:22,color:SOFT,borderColor:LINE,borderWidth:.5});let x=M;headers.forEach((h,i)=>{page.drawText(h,{x:x+4,y:y-10,size:6.2,font:bold,color:MUTED});x+=widths[i]});y-=24};drawHead();
 for(const e of input.entries){const descLines=wrap(e.description,font,6.8,widths[3]-8).slice(0,4);const h=Math.max(28,descLines.length*8.5+10);if(y-h<45){newPage();section(t.history);drawHead()}let x=M;page.drawRectangle({x:M,y:y-h+4,width:widths.reduce((a,b)=>a+b,0),height:h,borderColor:LINE,borderWidth:.4});const cells=[new Intl.DateTimeFormat(locale,{year:"2-digit",month:"short",day:"2-digit"}).format(e.date),e.type.replaceAll("_"," "),e.reference,"",e.status.replaceAll("_"," "),e.debit?money(e.debit,e.currency):"-",e.credit?money(e.credit,e.currency):"-",money(e.runningBalance,e.currency)];cells.forEach((cell,i)=>{if(i===3){descLines.forEach((l,j)=>page.drawText(l,{x:x+4,y:y-9-j*8.5,size:6.8,font,color:INK}))}else{const s=safe(cell);const align=i>=5;const tw=font.widthOfTextAtSize(s,6.5);page.drawText(s,{x:align?x+widths[i]-4-tw:x+4,y:y-9,size:6.5,font:i===7?bold:font,color:i===7&&e.runningBalance<0?RED:INK})}x+=widths[i]});y-=h;}

 y-=10;need(45);const note=input.balances.some(b=>b.available<0)?t.dueText:"This statement reflects the financial movements and committed service costs recorded in JUN Business Hub.";wrap(note,font,7.5,W-M*2).forEach(l=>{page.drawText(l,{x:M,y,size:7.5,font,color:MUTED});y-=10});
 footer();pdf.setTitle(t.title);pdf.setAuthor("JUN CREATIF AND TRAVEL LLC");await registerFinanceDocumentVerification({reference:input.reference,type:t.title,status:"ISSUED"});return pdf.save();
}
