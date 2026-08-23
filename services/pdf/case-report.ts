import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { buildFinanceDocumentVerificationUrl, registerFinanceDocumentVerification } from "@/lib/finance-document-verification";
import type { getCaseReport } from "@/lib/case-report";

type Report=NonNullable<Awaited<ReturnType<typeof getCaseReport>>>;
const W=595.28,H=841.89,M=42;
const INK=rgb(.055,.09,.16),MUTED=rgb(.4,.45,.55),LINE=rgb(.86,.88,.92),SOFT=rgb(.965,.97,.98),RED=rgb(.72,.10,.12),GREEN=rgb(.05,.45,.28);
function safe(v:unknown){return String(v??"").replace(/[–—]/g,"-").replace(/[^\x20-\x7EÀ-ÿ]/g," ").replace(/\s+/g," ").trim()}
function money(v:number,c:string){try{return new Intl.NumberFormat("en-US",{style:"currency",currency:c,minimumFractionDigits:2}).format(v)}catch{return `${c} ${v.toFixed(2)}`}}
function wrap(text:string,font:PDFFont,size:number,width:number){const out:string[]=[];let line="";for(const word of safe(text).split(/\s+/)){const probe=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(probe,size)<=width)line=probe;else{if(line)out.push(line);line=word}}if(line)out.push(line);return out.length?out:[""]}

export async function renderCaseReport(report:Report){
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page:PDFPage=pdf.addPage([W,H]),y=H-M,pageNo=1;
 const footer=()=>{page.drawLine({start:{x:M,y:31},end:{x:W-M,y:31},thickness:.5,color:LINE});page.drawText("JUN CREATIF AND TRAVEL LLC · www.juncreatif.org",{x:M,y:18,size:7,font,color:MUTED});const s=`${report.reportReference} · Page ${pageNo}`;page.drawText(s,{x:W-M-font.widthOfTextAtSize(s,7),y:18,size:7,font,color:MUTED})};
 const newPage=()=>{footer();page=pdf.addPage([W,H]);pageNo++;y=H-M;page.drawText("JUN CREATIF AND TRAVEL LLC",{x:M,y,size:9,font:bold,color:INK});y-=22};
 const need=(h:number)=>{if(y-h<46)newPage()};
 const section=(title:string)=>{need(38);y-=5;page.drawText(title,{x:M,y,size:14,font:bold,color:INK});y-=10;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.6,color:LINE});y-=18};
 const paragraph=(text:string,size=8.5)=>{const lines=wrap(text,font,size,W-M*2);need(lines.length*(size+3)+6);for(const l of lines){page.drawText(l,{x:M,y,size,font,color:INK});y-=size+3}y-=4};
 const row=(label:string,value:string,accent=false)=>{need(22);page.drawText(safe(label),{x:M,y,size:7.5,font:bold,color:MUTED});const vals=wrap(value,font,8.5,330);vals.slice(0,3).forEach((l,i)=>page.drawText(l,{x:220,y:y-i*11,size:8.5,font:accent?bold:font,color:accent?INK:INK}));y-=Math.max(18,vals.length*11+4)};

 page.drawText("JUN CREATIF AND TRAVEL LLC",{x:M,y,size:10,font:bold,color:INK});page.drawText("www.juncreatif.org",{x:W-M-font.widthOfTextAtSize("www.juncreatif.org",9),y,size:9,font,color:MUTED});y-=19;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.2,color:INK});y-=27;
 const verifyUrl=buildFinanceDocumentVerificationUrl(report.reportReference);const qr=await pdf.embedPng(await QRCode.toBuffer(verifyUrl,{margin:0,width:220,errorCorrectionLevel:"M"}));page.drawImage(qr,{x:W-M-62,y:y-54,width:58,height:58});
 page.drawText("CASE REPORT",{x:M,y,size:25,font:bold,color:INK});y-=29;page.drawText(report.reportReference,{x:M,y,size:8.5,font,color:MUTED});y-=24;
 page.drawText(`${safe(report.case.caseNumber)} · ${safe(report.case.title)}`,{x:M,y,size:12,font:bold,color:INK});y-=18;page.drawText(`${safe(report.case.client.firstName)} ${safe(report.case.client.lastName)} · ${safe(report.case.client.internalId)}`,{x:M,y,size:9,font,color:MUTED});y-=31;

 section("Executive summary");paragraph(report.executiveSummary,9);
 row("Status",report.case.status.replaceAll("_"," "),true);row("Priority",report.case.priority,true);row("Owner",report.case.owner?`${report.case.owner.firstName} ${report.case.owner.lastName}`:"Unassigned");row("Risk",`${report.intelligence.riskLevel} · ${report.intelligence.score}/100`,true);row("Closure readiness",report.intelligence.readiness.ready?"READY":"BLOCKED",true);row("Generated",report.generatedAt.toISOString().replace("T"," ").slice(0,16)+" UTC");

 section("Operations");row("Progress",`${report.operations.facts.progress}%`,true);row("Tasks",`${report.case.tasks.filter(t=>t.status==="DONE").length}/${report.case.tasks.filter(t=>t.status!=="CANCELLED").length} completed`);row("Milestones",`${report.operations.facts.milestoneDone}/${report.operations.milestones.filter(m=>m.status!=="CANCELLED").length} completed`);row("Blocked milestones",String(report.operations.facts.blockedMilestones.length));row("Overdue work",`${report.operations.facts.overdueTasks.length} task(s), ${report.operations.facts.overdueMilestones.length} milestone(s)`);
 if(report.operations.milestones.length){y-=4;for(const m of report.operations.milestones.slice(0,20)){need(28);page.drawRectangle({x:M,y:y-17,width:W-M*2,height:23,color:SOFT,borderColor:LINE,borderWidth:.4});page.drawText(safe(m.status.replaceAll("_"," ")),{x:M+7,y:y-9,size:6.8,font:bold,color:MUTED});page.drawText(safe(m.title).slice(0,76),{x:135,y:y-9,size:7.5,font,color:INK});y-=27}}

 section("Financial position");
 if(report.finance.summaries.length){for(const s of report.finance.summaries){need(95);page.drawRectangle({x:M,y:y-72,width:W-M*2,height:78,borderColor:LINE,borderWidth:.6});page.drawText(s.currency,{x:M+10,y:y-12,size:9,font:bold,color:MUTED});const vals=[[`Billed`,money(s.billed,s.currency)],[`Paid`,money(s.invoicePaid,s.currency)],[`Receivable`,money(s.receivable,s.currency)],[`Refunds paid`,money(s.refundsPaid,s.currency)],[`Expenses paid`,money(s.expensePaid,s.currency)],[`Realized profit`,money(s.realizedProfit,s.currency)]];vals.forEach((v,i)=>{const col=i%3,rowi=Math.floor(i/3);const x=M+12+col*170,yy=y-30-rowi*23;page.drawText(v[0],{x,y:yy,size:6.5,font,color:MUTED});page.drawText(v[1],{x,y:yy-10,size:8,font:v[0]==="Realized profit"?bold:font,color:v[0]==="Realized profit"&&s.realizedProfit<0?RED:v[0]==="Realized profit"?GREEN:INK})});y-=88}}else paragraph("No financial activity is linked to this Case.");

 section("Risk & next actions");row("Risk score",`${report.intelligence.score}/100 · ${report.intelligence.riskLevel}`,true);if(report.intelligence.insights.length){for(const i of report.intelligence.insights.slice(0,12)){need(42);page.drawText(`${safe(i.severity)} · ${safe(i.area)}`,{x:M,y,size:7,font:bold,color:i.severity==="CRITICAL"?RED:MUTED});y-=11;page.drawText(safe(i.title),{x:M,y,size:8.5,font:bold,color:INK});y-=11;for(const l of wrap(i.action,font,7.5,W-M*2)){page.drawText(l,{x:M,y,size:7.5,font,color:MUTED});y-=9}y-=5}}else paragraph("No active deterministic risk was detected.");

 section("Documents & communications");row("Official documents",String(report.case.documents.length));row("Drive files",String(report.case.files.length));row("FINAL / SIGNED",String(report.intelligence.health.finalDocuments));row("Communications",String(report.communications.length));row("Critical communications",String(report.intelligence.health.criticalCommunications),report.intelligence.health.criticalCommunications>0);
 if(report.case.documents.length){y-=3;for(const d of report.case.documents.slice(0,15)){need(22);page.drawText(safe(d.documentId),{x:M,y,size:7,font:bold,color:MUTED});page.drawText(safe(d.title).slice(0,65),{x:145,y,size:7.5,font,color:INK});page.drawText(safe(d.status),{x:490,y,size:7,font:bold,color:MUTED});y-=18}}

 section("Automation & closure");row("Safe Automation runs",String(report.automation.runs.length));row("Automation enabled",report.automation.plan?.config.enabled?"YES":"NO");row("Closure snapshot",report.closure?`Preserved · ${report.closure.closedAt}`:"Not yet closed");if(report.closure?.summary){paragraph(`Final closure summary: ${report.closure.summary}`,8.2)}

 section("Audit snapshot");paragraph("This report is generated from the current Case records in JUN Business Hub. Financial figures, operational status, risks and closure readiness use the same source logic as their respective Case modules. The QR code verifies the issued report reference.",7.8);
 footer();pdf.setTitle(`Case Report ${report.case.caseNumber}`);pdf.setAuthor("JUN CREATIF AND TRAVEL LLC");await registerFinanceDocumentVerification({reference:report.reportReference,type:"CASE REPORT",status:"ISSUED"});return pdf.save();
}
