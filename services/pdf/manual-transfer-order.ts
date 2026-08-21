import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import type { ManualTransferOrder, ManualTransferReceiver } from "@/lib/finance-manual-transfers";
import { buildFinanceDocumentVerificationUrl, registerFinanceDocumentVerification } from "@/lib/finance-document-verification";

const PAGE = { w: 595.28, h: 841.89, m: 46 };
const INK = rgb(.055, .09, .16), MUTED = rgb(.42, .46, .54), LINE = rgb(.86, .88, .92), SOFT = rgb(.965, .97, .98), BLUE = rgb(.10, .42, .92);
type Ctx = { pdf: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; y: number; pageNo: number; reference: string; company: string; website: string };

function pdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/•/g, "*")
    .replace(/…/g, "...")
    .split("")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return ch === "\n" || ch === "\t" || (code >= 32 && code <= 255);
    })
    .join("");
}

function safe(v: unknown) { return pdfText(v).replace(/[ \t]+/g, " ").trim(); }
function money(v: number, currency: string) { try { return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(v); } catch { return `${currency} ${Number(v).toFixed(2)}`; } }
function wrap(value: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const raw of pdfText(value).split("\n")) {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(probe, size) <= width) line = probe;
      else {
        if (line) out.push(line);
        let part = word;
        while (font.widthOfTextAtSize(part, size) > width && part.length > 2) {
          let cut = part.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(part.slice(0, cut), size) > width) cut--;
          out.push(part.slice(0, cut));
          part = part.slice(cut);
        }
        line = part;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [""];
}

async function company() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["company.name", "company.website", "company.mailing_address", "company.address", "company.phone", "company.finance_email", "company.email"] } },
    select: { key: true, value: true },
  }).catch(() => []);
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    name: safe(s["company.name"] || "JUN CREATIF AND TRAVEL LLC"),
    website: safe((s["company.website"] || "www.juncreatif.org").replace(/^https?:\/\//, "")),
    address: safe(s["company.mailing_address"] || s["company.address"] || ""),
    phone: safe(s["company.phone"] || ""),
    email: safe(s["company.finance_email"] || s["company.email"] || ""),
  };
}

function footer(c: Ctx) {
  c.page.drawLine({ start: { x: PAGE.m, y: 35 }, end: { x: PAGE.w - PAGE.m, y: 35 }, thickness: .5, color: LINE });
  c.page.drawText(safe(`${c.company} · ${c.website}`), { x: PAGE.m, y: 22, size: 7.2, font: c.font, color: MUTED });
  const p = safe(`${c.reference} · Page ${c.pageNo}`);
  c.page.drawText(p, { x: PAGE.w - PAGE.m - c.font.widthOfTextAtSize(p, 7.2), y: 22, size: 7.2, font: c.font, color: MUTED });
}

function addPage(c: Ctx) {
  if (c.pageNo) footer(c);
  c.page = c.pdf.addPage([PAGE.w, PAGE.h]);
  c.pageNo++;
  c.y = PAGE.h - PAGE.m;
  c.page.drawText(safe(c.company), { x: PAGE.m, y: c.y, size: 9, font: c.bold, color: INK });
  const website = safe(c.website);
  c.page.drawText(website, { x: PAGE.w - PAGE.m - c.font.widthOfTextAtSize(website, 8), y: c.y, size: 8, font: c.font, color: MUTED });
  c.y -= 18;
  c.page.drawLine({ start: { x: PAGE.m, y: c.y }, end: { x: PAGE.w - PAGE.m, y: c.y }, thickness: 1.2, color: INK });
  c.y -= 22;
}

function need(c: Ctx, h: number) { if (c.y - h < 52) addPage(c); }
function section(c: Ctx, title: string) {
  need(c, 34);
  c.y -= 2;
  c.page.drawText(safe(title), { x: PAGE.m, y: c.y, size: 13, font: c.bold, color: INK });
  c.y -= 10;
  c.page.drawLine({ start: { x: PAGE.m, y: c.y }, end: { x: PAGE.w - PAGE.m, y: c.y }, thickness: .6, color: LINE });
  c.y -= 17;
}
function field(c: Ctx, label: string, value: string, x: number, y: number, width: number) {
  c.page.drawText(safe(label).toUpperCase(), { x, y, size: 6.6, font: c.bold, color: MUTED });
  const lines = wrap(value || "-", c.font, 8.8, width);
  lines.slice(0, 3).forEach((line, i) => c.page.drawText(safe(line), { x, y: y - 13 - i * 11, size: 8.8, font: c.font, color: INK }));
}
function paragraph(c: Ctx, value: string, size = 8.6) {
  const lines = wrap(value, c.font, size, PAGE.w - PAGE.m * 2);
  need(c, lines.length * 11 + 8);
  for (const line of lines) {
    if (line) c.page.drawText(safe(line), { x: PAGE.m, y: c.y, size, font: c.font, color: INK });
    c.y -= 11;
  }
  c.y -= 4;
}
function receiverName(r: ManualTransferReceiver) { return [r.firstName, r.lastName].filter(Boolean).join(" ") || r.legalName || "-"; }

export async function renderManualTransferOrderPdf(order: ManualTransferOrder) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const co = await company();
  const c: Ctx = { pdf, page: null as unknown as PDFPage, font, bold, y: 0, pageNo: 0, reference: safe(order.orderNumber), company: co.name, website: co.website };
  addPage(c);

  const verifyUrl = buildFinanceDocumentVerificationUrl(order.orderNumber);
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 0, width: 220, errorCorrectionLevel: "M" }));
  c.page.drawImage(qr, { x: PAGE.w - PAGE.m - 50, y: c.y - 48, width: 50, height: 50 });
  c.page.drawText("SCAN TO VERIFY", { x: PAGE.w - PAGE.m - 49, y: c.y - 57, size: 5.6, font: bold, color: MUTED });

  c.page.drawText("Manual Payment Order", { x: PAGE.m, y: c.y, size: 22, font: bold, color: INK });
  const status = safe(order.status.replaceAll("_", " "));
  c.y -= 28;
  c.page.drawText(safe(order.orderNumber), { x: PAGE.m, y: c.y, size: 8.5, font, color: MUTED });
  c.page.drawText(status, { x: 255, y: c.y, size: 8, font: bold, color: BLUE });
  c.page.drawText("Authenticity: juncreatif.org/verify", { x: 350, y: c.y, size: 6.5, font, color: MUTED });
  c.y -= 15;
  const routeLine = safe(`${order.receiverSnapshot.rail.replaceAll("_", " ")} · ${order.originCountry} -> ${order.destinationCountry} · ${order.language}`);
  c.page.drawText(routeLine, { x: PAGE.m, y: c.y, size: 9, font, color: INK });
  c.y -= 26;

  const boxW = (PAGE.w - PAGE.m * 2 - 18) / 4;
  const metrics = [
    ["Amount to send", money(order.sendAmount, order.sendCurrency)],
    ["Fees deducted", money(order.feeAmount, order.sendCurrency)],
    ["Net after fees", money(order.netAfterFees, order.sendCurrency)],
    ["Estimated received", money(order.receiveAmount, order.receiveCurrency)],
  ];
  need(c, 72);
  metrics.forEach(([label, value], i) => {
    const x = PAGE.m + i * (boxW + 6);
    c.page.drawRectangle({ x, y: c.y - 54, width: boxW, height: 60, color: SOFT, borderColor: LINE, borderWidth: .5 });
    c.page.drawText(safe(label), { x: x + 8, y: c.y - 12, size: 6.5, font: bold, color: MUTED });
    const lines = wrap(value, font, 10.5, boxW - 16);
    lines.slice(0, 2).forEach((line, j) => c.page.drawText(safe(line), { x: x + 8, y: c.y - 31 - j * 12, size: 10.5, font: j === 0 ? bold : font, color: INK }));
  });
  c.y -= 78;

  section(c, "Transfer details");
  need(c, 100);
  field(c, "Payer / partner", order.payerName || "-", PAGE.m, c.y, 220);
  field(c, "Purpose", order.purpose || "Commercial payment", 320, c.y, 220);
  c.y -= 48;
  field(c, "Origin country", order.originCountry, PAGE.m, c.y, 130);
  field(c, "Destination country", order.destinationCountry, 190, c.y, 130);
  field(c, "Exchange rate", String(order.exchangeRate), 340, c.y, 100);
  field(c, "Receiving currency", order.receiveCurrency, 465, c.y, 80);
  c.y -= 55;

  const r = order.receiverSnapshot;
  section(c, "Beneficiary information");
  need(c, 245);
  field(c, "First name", r.firstName || "-", PAGE.m, c.y, 220);
  field(c, "Last name", r.lastName || "-", 320, c.y, 220);
  c.y -= 48;
  field(c, "Legal / business name", r.legalName || receiverName(r), PAGE.m, c.y, 494);
  c.y -= 48;
  field(c, "Phone", r.phone || "-", PAGE.m, c.y, 210);
  field(c, "Email", r.email || "-", 290, c.y, 250);
  c.y -= 48;
  field(c, "Street", r.receiverStreet || r.address || "-", PAGE.m, c.y, 494);
  c.y -= 48;
  field(c, "City", r.city || "-", PAGE.m, c.y, 130);
  field(c, "State / province", r.receiverState || "-", 190, c.y, 140);
  field(c, "Postal / ZIP code", r.receiverPostalCode || "-", 350, c.y, 100);
  field(c, "Country", r.country || "-", 470, c.y, 80);
  c.y -= 55;

  if (r.rail === "BANK_TRANSFER" || r.bankName || r.accountNumber || r.iban || r.swiftBic || r.routingNumber || r.clabe || r.bankAddress || r.bankStreet || r.bankCity || r.bankState || r.bankPostalCode || r.bankCountry) {
    section(c, "Beneficiary bank information");
    need(c, 300);
    field(c, "Bank name", r.bankName || "-", PAGE.m, c.y, 220);
    field(c, "Account holder", r.accountHolderName || receiverName(r), 320, c.y, 220);
    c.y -= 48;
    field(c, "Account number", r.accountNumber || "-", PAGE.m, c.y, 220);
    field(c, "Routing / ABA", r.routingNumber || "-", 320, c.y, 220);
    c.y -= 48;
    field(c, "SWIFT / BIC", r.swiftBic || "-", PAGE.m, c.y, 220);
    field(c, "IBAN", r.iban || "-", 320, c.y, 220);
    c.y -= 48;
    field(c, "CLABE", r.clabe || "-", PAGE.m, c.y, 220);
    field(c, "Branch code", r.branchCode || "-", 320, c.y, 220);
    c.y -= 48;
    field(c, "Bank street", r.bankStreet || r.bankAddress || "-", PAGE.m, c.y, 494);
    c.y -= 48;
    field(c, "Bank city", r.bankCity || "-", PAGE.m, c.y, 130);
    field(c, "Bank state / province", r.bankState || "-", 190, c.y, 140);
    field(c, "Bank postal / ZIP", r.bankPostalCode || "-", 350, c.y, 100);
    field(c, "Bank country", r.bankCountry || "-", 470, c.y, 80);
    c.y -= 55;
  }

  if (r.complianceNote) {
    section(c, "Compliance / special instructions");
    paragraph(c, r.complianceNote, 8.2);
  }

  section(c, "Instructions to sender");
  paragraph(c, order.instructions || "No additional instructions.", 8.7);

  need(c, 110);
  c.page.drawRectangle({ x: PAGE.m, y: c.y - 88, width: PAGE.w - PAGE.m * 2, height: 94, borderColor: LINE, borderWidth: .6 });
  c.page.drawText("IMPORTANT - BEFORE SENDING", { x: PAGE.m + 10, y: c.y - 10, size: 7, font: bold, color: MUTED });
  const warnings = [
    "Use the beneficiary information exactly as displayed in this payment order. Do not abbreviate or modify the beneficiary name.",
    "Enter the beneficiary address field by field: Street, City, State/Province, Postal/ZIP Code and Country.",
    "When your bank asks for the bank address, use the Beneficiary Bank Information section, not the beneficiary personal/business address.",
    "Before submitting, verify: beneficiary name, account number, Routing/ABA or SWIFT/BIC, bank name, beneficiary address, bank address, amount and currency. Keep the transaction receipt.",
  ];
  let wy = c.y - 24;
  for (const warning of warnings) {
    const lines = wrap(warning, font, 7.1, PAGE.w - PAGE.m * 2 - 24);
    for (const line of lines.slice(0, 2)) {
      c.page.drawText(safe(line), { x: PAGE.m + 10, y: wy, size: 7.1, font, color: INK });
      wy -= 9;
    }
    wy -= 2;
  }

  footer(c);
  pdf.setTitle(safe(`${order.orderNumber} - Manual Payment Order`));
  pdf.setAuthor(safe(co.name));
  pdf.setCreator("JUN Business Hub Finance PDF Engine");
  await registerFinanceDocumentVerification({ reference: order.orderNumber, type: "Manual Payment Order", status: order.status, issuedAt: order.createdAt });
  return pdf.save();
}
