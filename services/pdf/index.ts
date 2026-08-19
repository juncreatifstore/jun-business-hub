import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { htmlToText } from "@/lib/sanitize";

/**
 * Server-side PDF generation (pdf-lib — pure JS, no headless browser).
 * Every final PDF carries: JUN letterhead, company info, unique reference,
 * verification QR (→ /verify/[id]), date, pagination and footer.
 * The caller stores the bytes and records sha256(pdf) for tamper detection.
 */

const NIGHT = rgb(0.055, 0.09, 0.16);
const GOLD = rgb(0.79, 0.62, 0.2);
const GRAY = rgb(0.45, 0.48, 0.55);
const PAGE = { w: 595.28, h: 841.89, margin: 56 }; // A4 portrait

const COMPANY = {
  name: "JUN CREATIF AND TRAVEL LLC",
  site: "www.juncreatif.org",
  tagline: "Travel · Documents · Business Services",
};

type Ctx = { pdf: PDFDocument; page: PDFPage; y: number; font: PDFFont; bold: PDFFont; pageNo: number; footer: (p: PDFPage, n: number) => void };

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe;
      else { if (line) out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

function newPage(ctx: Ctx) {
  ctx.footer(ctx.page, ctx.pageNo);
  ctx.page = ctx.pdf.addPage([PAGE.w, PAGE.h]);
  ctx.pageNo += 1;
  ctx.y = PAGE.h - PAGE.margin;
}

function drawLines(ctx: Ctx, lines: string[], opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
  const size = opts.size ?? 10.5;
  const font = opts.bold ? ctx.bold : ctx.font;
  const lead = size * 1.45;
  for (const line of lines) {
    if (ctx.y < PAGE.margin + 40) newPage(ctx);
    if (line) ctx.page.drawText(line, { x: PAGE.margin, y: ctx.y, size, font, color: opts.color ?? NIGHT });
    ctx.y -= lead;
  }
  ctx.y -= opts.gap ?? 0;
}

async function buildBase(meta: {
  title: string;
  reference: string;
  verifyPath: string; // e.g. /verify/JUN-CTR-2026-000001
  statusLine: string;
  extraHeader?: string[];
}): Promise<{ ctx: Ctx; finish: () => Promise<Uint8Array> }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org").replace(/\/$/, "");
  const verifyUrl = `${base}${meta.verifyPath}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 0, width: 240 });
  const qrImg = await pdf.embedPng(qrPng);

  const footer = (p: PDFPage, n: number) => {
    p.drawLine({ start: { x: PAGE.margin, y: 44 }, end: { x: PAGE.w - PAGE.margin, y: 44 }, thickness: 0.5, color: GRAY });
    p.drawText(`${COMPANY.name} · ${COMPANY.site}`, { x: PAGE.margin, y: 30, size: 8, font, color: GRAY });
    p.drawText(`${meta.reference} — page ${n}`, { x: PAGE.w - PAGE.margin - font.widthOfTextAtSize(`${meta.reference} — page ${n}`, 8), y: 30, size: 8, font, color: GRAY });
  };

  const page = pdf.addPage([PAGE.w, PAGE.h]);
  const ctx: Ctx = { pdf, page, y: PAGE.h - PAGE.margin, font, bold, pageNo: 1, footer };

  // Letterhead
  ctx.page.drawText("JUN", { x: PAGE.margin, y: ctx.y - 8, size: 30, font: bold, color: NIGHT });
  ctx.page.drawText(COMPANY.name, { x: PAGE.margin + 70, y: ctx.y + 4, size: 11, font: bold, color: NIGHT });
  ctx.page.drawText(COMPANY.tagline, { x: PAGE.margin + 70, y: ctx.y - 9, size: 9, font, color: GRAY });
  // QR top-right
  ctx.page.drawImage(qrImg, { x: PAGE.w - PAGE.margin - 66, y: ctx.y - 46, width: 66, height: 66 });
  ctx.page.drawText("Scan to verify", { x: PAGE.w - PAGE.margin - 62, y: ctx.y - 58, size: 7, font, color: GRAY });
  ctx.page.drawLine({ start: { x: PAGE.margin, y: ctx.y - 26 }, end: { x: PAGE.w - PAGE.margin - 80, y: ctx.y - 26 }, thickness: 1, color: GOLD });
  ctx.y -= 84;

  // Title + meta block
  drawLines(ctx, wrap(meta.title, bold, 17, PAGE.w - 2 * PAGE.margin), { size: 17, bold: true, gap: 2 });
  drawLines(ctx, [
    `Reference: ${meta.reference}`,
    `Date: ${new Date().toISOString().slice(0, 10)}   ·   ${meta.statusLine}`,
    `Verify: ${verifyUrl}`,
    ...(meta.extraHeader ?? []),
  ], { size: 9, color: GRAY, gap: 10 });

  return {
    ctx,
    finish: async () => {
      ctx.footer(ctx.page, ctx.pageNo);
      // Total pages pass
      const pages = pdf.getPages();
      pages.forEach((p, i) => {
        p.drawText(`of ${pages.length}`, { x: PAGE.w - PAGE.margin - font.widthOfTextAtSize(`of ${pages.length}`, 8) , y: 20, size: 8, font, color: GRAY });
        void i;
      });
      return pdf.save();
    },
  };
}

/** Render a document's HTML content into a final branded PDF. */
export async function renderDocumentPdf(input: {
  documentId: string; // JUN-CTR-…
  title: string;
  type: string;
  status: string;
  html: string;
  clientName?: string | null;
  caseNumber?: string | null;
  signatureStatus?: string | null;
}): Promise<Uint8Array> {
  const { ctx, finish } = await buildBase({
    title: input.title,
    reference: input.documentId,
    verifyPath: `/verify/${input.documentId}`,
    statusLine: `Type: ${input.type}   ·   Status: ${input.status}${input.signatureStatus ? `   ·   Signature: ${input.signatureStatus}` : ""}`,
    extraHeader: [
      ...(input.clientName ? [`Client: ${input.clientName}`] : []),
      ...(input.caseNumber ? [`Case: ${input.caseNumber}`] : []),
    ],
  });

  // Content: sanitized HTML → structured plain text with light heading detection.
  const text = htmlToText(input.html);
  const width = PAGE.w - 2 * PAGE.margin;
  for (const block of text.split(/\n/)) {
    const isHeading = block.length > 0 && block.length < 80 && block === block.replace(/[.:]$/, "") && /^[A-Z0-9]/.test(block) && !/[a-z]{40}/.test(block) && block.split(" ").length <= 10 && text.indexOf(block) !== text.length;
    if (block.trim() === "") { ctx.y -= 6; continue; }
    drawLines(ctx, wrap(block, isHeading ? ctx.bold : ctx.font, isHeading ? 12.5 : 10.5, width), { size: isHeading ? 12.5 : 10.5, bold: isHeading, gap: isHeading ? 2 : 4 });
  }
  return finish();
}

/** Render an official payment receipt PDF. */
export async function renderReceiptPdf(input: {
  reference: string; // REC-…
  clientName: string;
  clientInternalId: string;
  amount: number;
  currency: string;
  method: string;
  paymentReference: string;
  paidAt: Date;
  issuedAt: Date;
  caseNumber?: string | null;
  reason?: string | null;
  issuerName: string;
}): Promise<Uint8Array> {
  const { ctx, finish } = await buildBase({
    title: "Official Payment Receipt",
    reference: input.reference,
    verifyPath: `/verify/${input.reference}`,
    statusLine: `Status: ISSUED`,
  });

  const rows: [string, string][] = [
    ["Receipt number", input.reference],
    ["Client", `${input.clientName} (${input.clientInternalId})`],
    ["Amount", `${input.currency} ${input.amount.toFixed(2)}`],
    ["Payment method", input.method],
    ["Transaction reference", input.paymentReference],
    ["Payment date", input.paidAt.toISOString().slice(0, 10)],
    ["Issued on", input.issuedAt.toISOString().slice(0, 10)],
    ...(input.caseNumber ? [["Case", input.caseNumber] as [string, string]] : []),
    ...(input.reason ? [["Details", input.reason] as [string, string]] : []),
    ["Issued by", input.issuerName],
  ];
  ctx.y -= 6;
  for (const [k, v] of rows) {
    if (ctx.y < PAGE.margin + 60) newPage(ctx);
    ctx.page.drawText(k, { x: PAGE.margin, y: ctx.y, size: 10, font: ctx.bold, color: NIGHT });
    for (const line of wrap(v, ctx.font, 10, PAGE.w - 2 * PAGE.margin - 170)) {
      ctx.page.drawText(line, { x: PAGE.margin + 170, y: ctx.y, size: 10, font: ctx.font, color: NIGHT });
      ctx.y -= 15;
    }
    ctx.y -= 6;
  }
  ctx.y -= 8;
  drawLines(ctx, ["This receipt is issued electronically by JUN CREATIF AND TRAVEL LLC and can be authenticated at any time using the QR code above or the verification link."], { size: 9, color: GRAY });
  return finish();
}
