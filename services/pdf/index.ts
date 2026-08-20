import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import { htmlToText } from "@/lib/sanitize";
import { parseDocumentPages } from "@/lib/document-pages";

/**
 * Server-side PDF generation (pdf-lib — pure JS, no headless browser).
 * Every final PDF carries: JUN letterhead, company info, unique reference,
 * verification QR (→ /verify/[id]), date, pagination and footer.
 * Optional premium logo + seal images can be provided with environment URLs:
 *   JUN_PDF_LOGO_URL
 *   JUN_PDF_SEAL_URL
 * The caller stores the bytes and records sha256(pdf) for tamper detection.
 */

const NIGHT = rgb(0.055, 0.09, 0.16);
const GOLD = rgb(0.79, 0.62, 0.2);
const GRAY = rgb(0.45, 0.48, 0.55);
const PAGE = { w: 595.28, h: 841.89, margin: 56 }; // A4 portrait base; rotation is page metadata.

const COMPANY = {
  name: "JUN CREATIF AND TRAVEL LLC",
  site: "www.juncreatif.org",
  tagline: "Travel · Documents · Business Services",
  mailingAddress: process.env.JUN_OFFICIAL_PO_BOX ?? "PO Box 770064, Orlando, FL 32877",
  phone: process.env.JUN_OFFICIAL_PHONE ?? "+1 480-954-1260",
  email: process.env.JUN_OFFICIAL_EMAIL ?? "",
};

type PageRotation = 0 | 90 | 180 | 270;
type BrandAssets = { logo: PDFImage | null; seal: PDFImage | null };
type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  pageNo: number;
  rotation: PageRotation;
  assets: BrandAssets;
  footer: (p: PDFPage, n: number) => void;
  decoratePage: (p: PDFPage) => void;
};

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

async function embedRemoteImage(pdf: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (contentType.includes("png") || url.toLowerCase().includes(".png")) return await pdf.embedPng(bytes);
    if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.jpe?g(?:$|\?)/i.test(url)) return await pdf.embedJpg(bytes);
    try { return await pdf.embedPng(bytes); } catch { return await pdf.embedJpg(bytes); }
  } catch {
    return null;
  }
}

/** Small repeated premium watermark marks across the printable area. */
function drawWatermark(page: PDFPage, logo: PDFImage | null, bold: PDFFont) {
  const cols = 3;
  const rows = 5;
  const left = PAGE.margin + 22;
  const right = PAGE.w - PAGE.margin - 22;
  const bottom = 90;
  const top = PAGE.h - 120;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = left + (right - left) * (cols === 1 ? 0.5 : col / (cols - 1));
      const cy = bottom + (top - bottom) * (rows === 1 ? 0.5 : row / (rows - 1));
      if (logo) {
        const maxW = 82;
        const maxH = 46;
        const scale = Math.min(maxW / logo.width, maxH / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;
        page.drawImage(logo, { x: cx - w / 2, y: cy - h / 2, width: w, height: h, opacity: 0.045 });
      } else {
        const text = "JUN";
        const size = 16;
        const w = bold.widthOfTextAtSize(text, size);
        page.drawText(text, { x: cx - w / 2, y: cy, size, font: bold, color: GRAY, opacity: 0.04 });
      }
    }
  }
}

function drawSeal(page: PDFPage, seal: PDFImage | null) {
  if (!seal) return;
  const max = 72;
  const scale = Math.min(max / seal.width, max / seal.height);
  const w = seal.width * scale;
  const h = seal.height * scale;
  page.drawImage(seal, {
    x: PAGE.w - PAGE.margin - w,
    y: 54,
    width: w,
    height: h,
    opacity: 0.92,
  });
}

function applyRotation(page: PDFPage, rotation: PageRotation) {
  page.setRotation(degrees(rotation));
}

function newPage(ctx: Ctx, rotation: PageRotation = ctx.rotation) {
  ctx.footer(ctx.page, ctx.pageNo);
  ctx.page = ctx.pdf.addPage([PAGE.w, PAGE.h]);
  ctx.pageNo += 1;
  ctx.rotation = rotation;
  applyRotation(ctx.page, rotation);
  ctx.decoratePage(ctx.page);
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
  verifyPath: string;
  statusLine: string;
  extraHeader?: string[];
}): Promise<{ ctx: Ctx; finish: () => Promise<Uint8Array> }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [logo, seal] = await Promise.all([
    embedRemoteImage(pdf, process.env.JUN_PDF_LOGO_URL),
    embedRemoteImage(pdf, process.env.JUN_PDF_SEAL_URL),
  ]);
  const assets: BrandAssets = { logo, seal };

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org").replace(/\/$/, "");
  const verifyUrl = `${base}${meta.verifyPath}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 0, width: 240 });
  const qrImg = await pdf.embedPng(qrPng);

  const decoratePage = (p: PDFPage) => drawWatermark(p, assets.logo, bold);
  const footer = (p: PDFPage, n: number) => {
    drawSeal(p, assets.seal);
    p.drawLine({ start: { x: PAGE.margin, y: 44 }, end: { x: PAGE.w - PAGE.margin, y: 44 }, thickness: 0.5, color: GRAY });
    p.drawText(`${COMPANY.name} · ${COMPANY.site}`, { x: PAGE.margin, y: 30, size: 8, font, color: GRAY });
    p.drawText(`${meta.reference} — page ${n}`, { x: PAGE.w - PAGE.margin - font.widthOfTextAtSize(`${meta.reference} — page ${n}`, 8), y: 30, size: 8, font, color: GRAY });
  };

  const page = pdf.addPage([PAGE.w, PAGE.h]);
  decoratePage(page);
  const ctx: Ctx = { pdf, page, y: PAGE.h - PAGE.margin, font, bold, pageNo: 1, rotation: 0, assets, footer, decoratePage };

  // Preserve the current JUN header layout.
  if (logo) {
    const maxW = 62;
    const maxH = 50;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.page.drawImage(logo, { x: PAGE.margin, y: ctx.y - h + 4, width: w, height: h });
  } else {
    ctx.page.drawText("JUN", { x: PAGE.margin, y: ctx.y - 8, size: 30, font: bold, color: NIGHT });
  }

  const infoX = PAGE.margin + 70;
  ctx.page.drawText(COMPANY.name, { x: infoX, y: ctx.y + 7, size: 11, font: bold, color: NIGHT });
  ctx.page.drawText(COMPANY.tagline, { x: infoX, y: ctx.y - 5, size: 8.5, font, color: GRAY });
  ctx.page.drawText(COMPANY.mailingAddress, { x: infoX, y: ctx.y - 17, size: 7.5, font, color: GRAY });
  const contact = [COMPANY.phone, COMPANY.email].filter(Boolean).join(" · ");
  if (contact) ctx.page.drawText(contact, { x: infoX, y: ctx.y - 28, size: 7.5, font, color: GRAY });

  ctx.page.drawImage(qrImg, { x: PAGE.w - PAGE.margin - 60, y: ctx.y - 44, width: 60, height: 60 });
  ctx.page.drawText("Scan to verify", { x: PAGE.w - PAGE.margin - 57, y: ctx.y - 55, size: 7, font, color: GRAY });
  ctx.page.drawLine({ start: { x: PAGE.margin, y: ctx.y - 38 }, end: { x: PAGE.w - PAGE.margin - 76, y: ctx.y - 38 }, thickness: 1, color: GOLD });
  ctx.y -= 94;

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
      const pages = pdf.getPages();
      pages.forEach((p) => {
        p.drawText(`of ${pages.length}`, { x: PAGE.w - PAGE.margin - font.widthOfTextAtSize(`of ${pages.length}`, 8), y: 20, size: 8, font, color: GRAY });
      });
      return pdf.save();
    },
  };
}

function renderTextPage(ctx: Ctx, html: string) {
  const text = htmlToText(html);
  const width = PAGE.w - 2 * PAGE.margin;
  for (const block of text.split(/\n/)) {
    const isHeading = block.length > 0 && block.length < 80 && block === block.replace(/[.:]$/, "") && /^[A-Z0-9]/.test(block) && !/[a-z]{40}/.test(block) && block.split(" ").length <= 10 && text.indexOf(block) !== text.length;
    if (block.trim() === "") { ctx.y -= 6; continue; }
    drawLines(ctx, wrap(block, isHeading ? ctx.bold : ctx.font, isHeading ? 12.5 : 10.5, width), { size: isHeading ? 12.5 : 10.5, bold: isHeading, gap: isHeading ? 2 : 4 });
  }
}

/** Render a document's HTML content into a final branded PDF. JUN page markers are hard page breaks. */
export async function renderDocumentPdf(input: {
  documentId: string;
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

  const logicalPages = parseDocumentPages(input.html);
  for (let i = 0; i < logicalPages.length; i++) {
    const logical = logicalPages[i];
    if (i === 0) {
      ctx.rotation = logical.rotation;
      applyRotation(ctx.page, logical.rotation);
    } else {
      newPage(ctx, logical.rotation);
    }
    renderTextPage(ctx, logical.html);
  }
  return finish();
}

/** Render an official payment receipt PDF. */
export async function renderReceiptPdf(input: {
  reference: string;
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
