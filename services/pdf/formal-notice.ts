import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { normalizeDocumentHtmlInput, htmlToText } from "@/lib/sanitize";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const W = 595.28;
const H = 841.89;
const M = 52;
const NAVY = rgb(0.055, 0.09, 0.16);
const BLUE = rgb(0.16, 0.34, 0.63);
const GOLD = rgb(0.78, 0.58, 0.16);
const GRAY = rgb(0.43, 0.47, 0.55);
const LIGHT = rgb(0.90, 0.92, 0.95);
const PALE = rgb(0.965, 0.972, 0.985);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const probe = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(probe, size) <= maxWidth) line = probe;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function imageFromStorage(pdf: PDFDocument, key: string, fallback?: string): Promise<PDFImage | null> {
  let bytes: Uint8Array | null = null;
  if (key) {
    try { bytes = new Uint8Array(await storage().download(key)); } catch {}
  }
  if (!bytes && fallback) {
    try {
      const res = await fetch(fallback, { cache: "no-store" });
      if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
    } catch {}
  }
  if (!bytes) return null;
  try { return await pdf.embedPng(bytes); } catch {
    try { return await pdf.embedJpg(bytes); } catch { return null; }
  }
}

function clean(fragment: string) {
  return htmlToText(normalizeDocumentHtmlInput(fragment)).replace(/\n{3,}/g, "\n\n").trim();
}

type Block = { kind: "h1" | "h2" | "p" | "li"; text: string };
function parseBlocks(html: string): Block[] {
  const normalized = normalizeDocumentHtmlInput(html);
  const blocks: Block[] = [];
  const re = /<(h1|h2|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized))) {
    const text = clean(match[2]);
    if (text) blocks.push({ kind: match[1].toLowerCase() as Block["kind"], text });
  }
  if (blocks.length) return blocks;
  return clean(normalized).split(/\n+/).map((text) => text.trim()).filter(Boolean).map((text) => ({ kind: "p" as const, text }));
}

export function isFormalRelationshipNotice(title: string, html = "") {
  const text = `${title} ${clean(html)}`.toLowerCase();
  return /termination|end commercial relationship|fin de relation|fin nan relasyon|fen nan relasyon|relationship termination|cessation.*relation/.test(text);
}

export async function renderFormalNoticePdf(input: {
  documentId: string;
  title: string;
  type: string;
  status: string;
  html: string;
  clientName?: string | null;
  caseNumber?: string | null;
  signatureStatus?: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const keys = [
    "company.name", "company.tagline", "company.website", "company.mailing_address", "company.po_box", "company.phone", "company.email",
    "company.legal_representative", "company.representative_title", "document.logo_key", "document.seal_key", "document.signature_key",
  ];
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } }).catch(() => []);
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const company = s["company.name"] || "JUN CREATIF AND TRAVEL LLC";
  const tagline = s["company.tagline"] || "Travel · Documents · Business Services";
  const website = (s["company.website"] || "www.juncreatif.org").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const address = s["company.mailing_address"] || s["company.po_box"] || "PO Box 770064, Orlando, FL 32877";
  const phone = s["company.phone"] || "+1 480-954-1260";
  const email = s["company.email"] || "";
  const representative = s["company.legal_representative"] || "";
  const representativeTitle = s["company.representative_title"] || "Authorized Representative";

  const [logo, seal, signature] = await Promise.all([
    imageFromStorage(pdf, s["document.logo_key"] || "", process.env.JUN_PDF_LOGO_URL),
    imageFromStorage(pdf, s["document.seal_key"] || "", process.env.JUN_PDF_SEAL_URL),
    imageFromStorage(pdf, s["document.signature_key"] || ""),
  ]);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.juncreatif.org").replace(/\/$/, "");
  const qr = await pdf.embedPng(await QRCode.toBuffer(`${base}/verify/${input.documentId}`, { width: 260, margin: 0 }));
  const date = new Date().toISOString().slice(0, 10);
  const blocks = parseBlocks(input.html);
  let pageNo = 0;
  let page: PDFPage;
  let y = 0;

  const footer = (p: PDFPage) => {
    p.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.45, color: LIGHT });
    p.drawText(`${company} · ${website}`, { x: M, y: 27, size: 7.3, font, color: GRAY });
    const right = `${input.documentId} · ${pageNo}`;
    p.drawText(right, { x: W - M - font.widthOfTextAtSize(right, 7.3), y: 27, size: 7.3, font, color: GRAY });
  };

  const addPage = (first = false) => {
    if (pageNo > 0) footer(page);
    page = pdf.addPage([W, H]);
    pageNo++;

    if (first) {
      if (logo) {
        const scale = Math.min(92 / logo.width, 66 / logo.height);
        page.drawImage(logo, { x: M, y: H - 111, width: logo.width * scale, height: logo.height * scale });
      } else {
        page.drawText("JUN", { x: M, y: H - 82, size: 30, font: bold, color: NAVY });
      }

      const infoX = M + 108;
      page.drawText(company, { x: infoX, y: H - 61, size: 13.2, font: bold, color: NAVY });
      page.drawText(tagline, { x: infoX, y: H - 78, size: 8.4, font, color: GRAY });
      page.drawText(address.slice(0, 90), { x: infoX, y: H - 92, size: 7.8, font, color: GRAY });
      const contact = [phone, email].filter(Boolean).join(" · ");
      if (contact) page.drawText(contact.slice(0, 88), { x: infoX, y: H - 105, size: 7.8, font, color: GRAY });

      page.drawImage(qr, { x: W - M - 70, y: H - 114, width: 70, height: 70 });
      page.drawText("SCAN TO VERIFY", { x: W - M - 67, y: H - 124, size: 6.6, font: bold, color: GRAY });
      page.drawLine({ start: { x: M, y: H - 137 }, end: { x: W - M, y: H - 137 }, thickness: 1.5, color: GOLD });

      y = H - 176;
      page.drawRectangle({ x: M, y: y - 48, width: W - 2 * M, height: 48, color: PALE, borderColor: LIGHT, borderWidth: 0.7 });
      const titleLines = wrap(input.title.toUpperCase(), bold, 16.2, W - 2 * M - 24);
      titleLines.slice(0, 2).forEach((line, i) => page.drawText(line, { x: M + 12, y: y - 20 - i * 18, size: 16.2, font: bold, color: NAVY }));
      y -= 66;

      const meta = `${input.documentId}  ·  ${date}  ·  ${input.type.replaceAll("_", " ")}  ·  ${input.status}`;
      page.drawText(meta, { x: M, y, size: 7.8, font: bold, color: BLUE });
      y -= 14;
      if (input.clientName) { page.drawText(`Client: ${input.clientName}`, { x: M, y, size: 8.5, font, color: GRAY }); y -= 13; }
      if (input.caseNumber) { page.drawText(`Case: ${input.caseNumber}`, { x: M, y, size: 8.5, font, color: GRAY }); y -= 13; }
      y -= 9;
    } else {
      page.drawText(company, { x: M, y: H - 50, size: 9.5, font: bold, color: NAVY });
      page.drawText(input.documentId, { x: W - M - font.widthOfTextAtSize(input.documentId, 8), y: H - 50, size: 8, font, color: GRAY });
      page.drawLine({ start: { x: M, y: H - 60 }, end: { x: W - M, y: H - 60 }, thickness: 0.6, color: GOLD });
      y = H - 86;
    }
  };

  const ensure = (need: number) => { if (y < 70 + need) addPage(false); };
  const drawTextBlock = (text: string, size: number, lineHeight: number, useBold = false, indent = 0, color = NAVY) => {
    const f = useBold ? bold : font;
    const maxWidth = W - 2 * M - indent;
    const lines = wrap(text, f, size, maxWidth);
    ensure(lines.length * lineHeight + 12);
    for (const line of lines) {
      page.drawText(line, { x: M + indent, y, size, font: f, color });
      y -= lineHeight;
    }
  };

  addPage(true);
  for (const block of blocks) {
    if (block.kind === "h1") {
      ensure(38);
      y -= 5;
      drawTextBlock(block.text, 13.3, 17, true, 0, NAVY);
      page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + 80, y: y + 3 }, thickness: 1.2, color: GOLD });
      y -= 10;
    } else if (block.kind === "h2") {
      ensure(32);
      y -= 5;
      drawTextBlock(block.text, 11.5, 15, true, 0, NAVY);
      y -= 5;
    } else if (block.kind === "li") {
      ensure(24);
      page.drawCircle({ x: M + 4, y: y + 3, size: 1.7, color: BLUE });
      drawTextBlock(block.text, 10.15, 14.3, false, 14, NAVY);
      y -= 4;
    } else {
      drawTextBlock(block.text, 10.15, 14.6, false, 0, NAVY);
      y -= 8;
    }
  }

  const bodyText = clean(input.html).toLowerCase();
  const hasSignatureBlock = /signature|siyati|authorized representative|représentant autorisé|pour jun creatif|for jun creatif/.test(bodyText);
  if (!hasSignatureBlock) {
    ensure(115);
    y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: LIGHT });
    y -= 22;
    page.drawText("OFFICIAL AUTHORIZATION", { x: M, y, size: 9.2, font: bold, color: NAVY });
    y -= 18;
    page.drawText(`For ${company}`, { x: M, y, size: 10.2, font: bold, color: NAVY });
    y -= 17;
    if (representative) { page.drawText(representative, { x: M, y, size: 9.8, font: bold, color: NAVY }); y -= 14; }
    page.drawText(representativeTitle, { x: M, y, size: 8.5, font, color: GRAY });
    if (signature) {
      const scale = Math.min(120 / signature.width, 38 / signature.height);
      page.drawImage(signature, { x: M, y: y - 44, width: signature.width * scale, height: signature.height * scale });
      y -= 52;
    } else {
      y -= 24;
      page.drawLine({ start: { x: M, y }, end: { x: M + 170, y }, thickness: 0.6, color: GRAY });
      y -= 13;
      page.drawText("Authorized signature", { x: M, y, size: 7.7, font, color: GRAY });
    }
    page.drawText(`Date: ${date}`, { x: M + 230, y: y + 13, size: 8.5, font, color: GRAY });
  }

  if (seal) {
    const scale = Math.min(64 / seal.width, 64 / seal.height);
    page.drawImage(seal, { x: W - M - seal.width * scale, y: 56, width: seal.width * scale, height: seal.height * scale, opacity: 0.88 });
  }

  footer(page);
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    const pagination = `${index + 1}/${pages.length}`;
    p.drawText(pagination, { x: W / 2 - font.widthOfTextAtSize(pagination, 7.2) / 2, y: 27, size: 7.2, font, color: GRAY });
  });
  return pdf.save();
}
