import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import { htmlToText, normalizeDocumentHtmlInput } from "@/lib/sanitize";
import { parseDocumentPages } from "@/lib/document-pages";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const NIGHT = rgb(0.055, 0.09, 0.16);
const GOLD = rgb(0.79, 0.62, 0.2);
const GRAY = rgb(0.45, 0.48, 0.55);
const LIGHT = rgb(0.91, 0.92, 0.94);
const PAGE = { w: 595.28, h: 841.89, margin: 56 };

const DEFAULT_COMPANY = {
  name: "JUN CREATIF AND TRAVEL LLC",
  site: "www.juncreatif.org",
  tagline: "Travel · Documents · Business Services",
  mailingAddress: "PO Box 770064, Orlando, FL 32877",
  address: "",
  phone: "+1 480-954-1260",
  whatsapp: "",
  email: "",
  registration: "",
  taxId: "",
  footerLabel: "",
  watermarkOpacity: 0.055,
  sealSize: 72,
};

type OfficialCompany = typeof DEFAULT_COMPANY;
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

async function loadOfficialCompany(): Promise<OfficialCompany & { logoKey: string; sealKey: string }> {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: [
        "company.name", "company.tagline", "company.website", "company.po_box", "company.address",
        "company.phone", "company.whatsapp", "company.email", "company.registration", "company.tax_id",
        "document.footer_label", "document.watermark_opacity", "document.seal_size",
        "document.logo_key", "document.seal_key",
      ] } },
    });
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const website = (s["company.website"] || DEFAULT_COMPANY.site).replace(/^https?:\/\//i, "").replace(/\/$/, "");
    const opacity = Number(s["document.watermark_opacity"] ?? DEFAULT_COMPANY.watermarkOpacity);
    const sealSize = Number(s["document.seal_size"] ?? DEFAULT_COMPANY.sealSize);
    return {
      name: s["company.name"] || DEFAULT_COMPANY.name,
      site: website,
      tagline: s["company.tagline"] || DEFAULT_COMPANY.tagline,
      mailingAddress: s["company.po_box"] || DEFAULT_COMPANY.mailingAddress,
      address: s["company.address"] || "",
      phone: s["company.phone"] || DEFAULT_COMPANY.phone,
      whatsapp: s["company.whatsapp"] || "",
      email: s["company.email"] || "",
      registration: s["company.registration"] || "",
      taxId: s["company.tax_id"] || "",
      footerLabel: s["document.footer_label"] || "",
      watermarkOpacity: Number.isFinite(opacity) ? Math.min(0.12, Math.max(0.02, opacity)) : DEFAULT_COMPANY.watermarkOpacity,
      sealSize: Number.isFinite(sealSize) ? Math.min(120, Math.max(40, sealSize)) : DEFAULT_COMPANY.sealSize,
      logoKey: s["document.logo_key"] || "",
      sealKey: s["document.seal_key"] || "",
    };
  } catch {
    return { ...DEFAULT_COMPANY, logoKey: "", sealKey: "" };
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) { out.push(""); continue; }
    let line = "";
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe;
      else { if (line) out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

async function embedBytes(pdf: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
  try { return await pdf.embedPng(bytes); } catch {
    try { return await pdf.embedJpg(bytes); } catch { return null; }
  }
}

async function embedStoredImage(pdf: PDFDocument, key: string, fallbackUrl?: string): Promise<PDFImage | null> {
  if (key) {
    try { return await embedBytes(pdf, new Uint8Array(await storage().download(key))); } catch {}
  }
  if (!fallbackUrl) return null;
  try {
    const res = await fetch(fallbackUrl, { cache: "no-store" });
    if (!res.ok) return null;
    return await embedBytes(pdf, new Uint8Array(await res.arrayBuffer()));
  } catch { return null; }
}

function drawWatermark(page: PDFPage, logo: PDFImage | null, bold: PDFFont, opacity: number) {
  const cols = 3;
  const rows = 5;
  const left = PAGE.margin + 22;
  const right = PAGE.w - PAGE.margin - 22;
  const bottom = 90;
  const top = PAGE.h - 120;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = left + (right - left) * (col / (cols - 1));
      const cy = bottom + (top - bottom) * (row / (rows - 1));
      if (logo) {
        const scale = Math.min(78 / logo.width, 42 / logo.height);
        const w = logo.width * scale;
        const h = logo.height * scale;
        page.drawImage(logo, { x: cx - w / 2, y: cy - h / 2, width: w, height: h, opacity });
      } else {
        const text = "JUN";
        const size = 15;
        const w = bold.widthOfTextAtSize(text, size);
        page.drawText(text, { x: cx - w / 2, y: cy, size, font: bold, color: GRAY, opacity: Math.min(opacity, 0.05) });
      }
    }
  }
}

function drawSeal(page: PDFPage, seal: PDFImage | null, max: number) {
  if (!seal) return;
  const scale = Math.min(max / seal.width, max / seal.height);
  const w = seal.width * scale;
  const h = seal.height * scale;
  page.drawImage(seal, { x: PAGE.w - PAGE.margin - w, y: 50, width: w, height: h, opacity: 0.92 });
}

function applyRotation(page: PDFPage, rotation: PageRotation) { page.setRotation(degrees(rotation)); }

function newPage(ctx: Ctx, rotation: PageRotation = ctx.rotation) {
  ctx.footer(ctx.page, ctx.pageNo);
  ctx.page = ctx.pdf.addPage([PAGE.w, PAGE.h]);
  ctx.pageNo += 1;
  ctx.rotation = rotation;
  applyRotation(ctx.page, rotation);
  ctx.decoratePage(ctx.page);
  ctx.y = PAGE.h - 72;
}

function drawLines(ctx: Ctx, lines: string[], opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; lead?: number; indent?: number } = {}) {
  const size = opts.size ?? 9.7;
  const font = opts.bold ? ctx.bold : ctx.font;
  const lead = opts.lead ?? size * 1.28;
  const x = PAGE.margin + (opts.indent ?? 0);
  for (const line of lines) {
    if (ctx.y < PAGE.margin + 52) newPage(ctx);
    if (line) ctx.page.drawText(line, { x, y: ctx.y, size, font, color: opts.color ?? NIGHT });
    ctx.y -= lead;
  }
  ctx.y -= opts.gap ?? 0;
}

async function buildBase(meta: { title: string; reference: string; verifyPath: string; statusLine: string; extraHeader?: string[] }): Promise<{ ctx: Ctx; finish: () => Promise<Uint8Array> }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const company = await loadOfficialCompany();

  const [logo, seal] = await Promise.all([
    embedStoredImage(pdf, company.logoKey, process.env.JUN_PDF_LOGO_URL),
    embedStoredImage(pdf, company.sealKey, process.env.JUN_PDF_SEAL_URL),
  ]);
  const assets: BrandAssets = { logo, seal };

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org").replace(/\/$/, "");
  const verifyUrl = `${base}${meta.verifyPath}`;
  const qrImg = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 0, width: 240 }));

  const decoratePage = (p: PDFPage) => drawWatermark(p, assets.logo, bold, company.watermarkOpacity);
  const footer = (p: PDFPage, n: number) => {
    drawSeal(p, assets.seal, company.sealSize);
    p.drawLine({ start: { x: PAGE.margin, y: 43 }, end: { x: PAGE.w - PAGE.margin, y: 43 }, thickness: 0.45, color: LIGHT });
    const leftFooter = company.footerLabel || `${company.name} · ${company.site}`;
    p.drawText(leftFooter.slice(0, 75), { x: PAGE.margin, y: 29, size: 7.4, font, color: GRAY });
    const pageText = `${meta.reference} · ${n}`;
    p.drawText(pageText, { x: PAGE.w - PAGE.margin - font.widthOfTextAtSize(pageText, 7.4), y: 29, size: 7.4, font, color: GRAY });
  };

  const page = pdf.addPage([PAGE.w, PAGE.h]);
  decoratePage(page);
  const ctx: Ctx = { pdf, page, y: PAGE.h - PAGE.margin, font, bold, pageNo: 1, rotation: 0, assets, footer, decoratePage };

  if (logo) {
    const scale = Math.min(62 / logo.width, 50 / logo.height);
    const w = logo.width * scale;
    const h = logo.height * scale;
    ctx.page.drawImage(logo, { x: PAGE.margin, y: ctx.y - h + 4, width: w, height: h });
  } else {
    ctx.page.drawText("JUN", { x: PAGE.margin, y: ctx.y - 8, size: 30, font: bold, color: NIGHT });
  }

  const infoX = PAGE.margin + 70;
  ctx.page.drawText(company.name.slice(0, 60), { x: infoX, y: ctx.y + 7, size: 11, font: bold, color: NIGHT });
  ctx.page.drawText(company.tagline.slice(0, 80), { x: infoX, y: ctx.y - 5, size: 8.2, font, color: GRAY });
  ctx.page.drawText(company.mailingAddress.slice(0, 85), { x: infoX, y: ctx.y - 17, size: 7.3, font, color: GRAY });
  const contact = [company.phone, company.email].filter(Boolean).join(" · ");
  if (contact) ctx.page.drawText(contact.slice(0, 85), { x: infoX, y: ctx.y - 28, size: 7.3, font, color: GRAY });

  ctx.page.drawImage(qrImg, { x: PAGE.w - PAGE.margin - 58, y: ctx.y - 42, width: 58, height: 58 });
  ctx.page.drawText("Scan to verify", { x: PAGE.w - PAGE.margin - 55, y: ctx.y - 53, size: 6.8, font, color: GRAY });
  ctx.page.drawLine({ start: { x: PAGE.margin, y: ctx.y - 38 }, end: { x: PAGE.w - PAGE.margin - 74, y: ctx.y - 38 }, thickness: 1, color: GOLD });
  ctx.y -= 86;

  drawLines(ctx, wrap(meta.title, bold, 15.2, PAGE.w - 2 * PAGE.margin), { size: 15.2, bold: true, lead: 18, gap: 4 });
  const metaLine1 = `${meta.reference} · ${new Date().toISOString().slice(0, 10)} · ${meta.statusLine}`;
  drawLines(ctx, wrap(metaLine1, font, 7.7, PAGE.w - 2 * PAGE.margin), { size: 7.7, color: GRAY, lead: 10, gap: 1 });
  for (const extra of meta.extraHeader ?? []) drawLines(ctx, wrap(extra, font, 7.7, PAGE.w - 2 * PAGE.margin), { size: 7.7, color: GRAY, lead: 10 });
  ctx.y -= 7;
  ctx.page.drawLine({ start: { x: PAGE.margin, y: ctx.y + 3 }, end: { x: PAGE.w - PAGE.margin, y: ctx.y + 3 }, thickness: 0.35, color: LIGHT });
  ctx.y -= 8;

  return {
    ctx,
    finish: async () => {
      ctx.footer(ctx.page, ctx.pageNo);
      const pages = pdf.getPages();
      pages.forEach((p, index) => {
        const total = `${index + 1}/${pages.length}`;
        p.drawText(total, { x: PAGE.w / 2 - font.widthOfTextAtSize(total, 7.2) / 2, y: 29, size: 7.2, font, color: GRAY });
      });
      return pdf.save();
    },
  };
}

function cleanBodyText(html: string): string {
  return htmlToText(normalizeDocumentHtmlInput(html))
    .replace(/^\s*[`*_~]+\s*html\s*[`*_~]*\s*$/gim, "")
    .replace(/^\s*```.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeadingLine(block: string): boolean {
  const text = block.trim();
  if (!text || text.length > 90 || text.split(/\s+/).length > 12) return false;
  if (/^\[[^\]]+\]$/.test(text)) return false;
  if (/^(Date|Dat|From|To|Ant|Ak|Objet|Objè|Reference|Référence|Client|Case|Dossier)\s*:/i.test(text)) return false;
  return /^[A-ZÀ-ÖØ-Þ0-9]/.test(text) && !/[.!?]$/.test(text);
}

function renderTextPage(ctx: Ctx, html: string) {
  const text = cleanBodyText(html);
  if (!text) return;
  const width = PAGE.w - 2 * PAGE.margin;
  const blocks = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  for (const block of blocks) {
    const heading = isHeadingLine(block);
    if (heading) {
      if (ctx.y < PAGE.margin + 92) newPage(ctx);
      drawLines(ctx, wrap(block, ctx.bold, 10.5, width), { size: 10.5, bold: true, lead: 13.2, gap: 2.5 });
    } else {
      drawLines(ctx, wrap(block, ctx.font, 9.35, width), { size: 9.35, lead: 12.1, gap: 2.2 });
    }
  }
}

export async function renderDocumentPdf(input: { documentId: string; title: string; type: string; status: string; html: string; clientName?: string | null; caseNumber?: string | null; signatureStatus?: string | null }): Promise<Uint8Array> {
  const normalizedHtml = normalizeDocumentHtmlInput(input.html);
  const { ctx, finish } = await buildBase({
    title: input.title,
    reference: input.documentId,
    verifyPath: `/verify/${input.documentId}`,
    statusLine: `${input.type.replaceAll("_", " ")} · ${input.status}${input.signatureStatus ? ` · Signature ${input.signatureStatus}` : ""}`,
    extraHeader: [
      ...(input.clientName ? [`Client: ${input.clientName}`] : []),
      ...(input.caseNumber ? [`Case: ${input.caseNumber}`] : []),
    ],
  });

  const logicalPages = parseDocumentPages(normalizedHtml).filter((p) => cleanBodyText(p.html).length > 0);
  const pages = logicalPages.length ? logicalPages : [{ id: "page-1", rotation: 0 as const, html: normalizedHtml }];
  for (let i = 0; i < pages.length; i++) {
    const logical = pages[i];
    if (i === 0) { ctx.rotation = logical.rotation; applyRotation(ctx.page, logical.rotation); }
    else newPage(ctx, logical.rotation);
    renderTextPage(ctx, logical.html);
  }
  return finish();
}

export async function renderReceiptPdf(input: { reference: string; clientName: string; clientInternalId: string; amount: number; currency: string; method: string; paymentReference: string; paidAt: Date; issuedAt: Date; caseNumber?: string | null; reason?: string | null; issuerName: string }): Promise<Uint8Array> {
  const { ctx, finish } = await buildBase({ title: "Official Payment Receipt", reference: input.reference, verifyPath: `/verify/${input.reference}`, statusLine: "RECEIPT · ISSUED" });
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
  ctx.y -= 4;
  for (const [key, value] of rows) {
    if (ctx.y < PAGE.margin + 60) newPage(ctx);
    ctx.page.drawText(key, { x: PAGE.margin, y: ctx.y, size: 9.4, font: ctx.bold, color: NIGHT });
    const valueLines = wrap(value, ctx.font, 9.4, PAGE.w - 2 * PAGE.margin - 165);
    valueLines.forEach((line, index) => ctx.page.drawText(line, { x: PAGE.margin + 165, y: ctx.y - index * 12, size: 9.4, font: ctx.font, color: NIGHT }));
    ctx.y -= Math.max(1, valueLines.length) * 12 + 4;
  }
  ctx.y -= 6;
  drawLines(ctx, ["This receipt is issued electronically and can be authenticated using the QR code above."], { size: 8.6, color: GRAY });
  return finish();
}
