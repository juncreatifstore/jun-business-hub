import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

/**
 * Stamps every page of a PDF with a diagonal watermark and a footer line.
 * Returns the original bytes when the PDF is encrypted or cannot be parsed.
 */
export async function watermarkPdf(input: Buffer, text: string, footer: string): Promise<Buffer> {
  try {
    const pdf = await PDFDocument.load(input, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const small = await pdf.embedFont(StandardFonts.Helvetica);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const size = Math.max(18, Math.min(width, height) / 12);
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: width / 2 - (textWidth * Math.SQRT1_2) / 2,
        y: height / 2 - (textWidth * Math.SQRT1_2) / 2 - size / 2,
        size,
        font,
        color: rgb(0.85, 0.1, 0.1),
        opacity: 0.14,
        rotate: degrees(45),
      });
      page.drawText(footer, {
        x: 24,
        y: 14,
        size: 7,
        font: small,
        color: rgb(0.35, 0.35, 0.35),
        opacity: 0.8,
      });
    }
    return Buffer.from(await pdf.save({ useObjectStreams: true }));
  } catch {
    return input;
  }
}
