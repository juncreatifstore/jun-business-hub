import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { signatureRecipients } from "@/lib/signature-recipients";

export const dynamic = "force-dynamic";

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "DOCUMENT_READ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const request = await prisma.signatureRequest.findUnique({
    where: { id: params.id },
    include: { document: { include: { client: true } }, createdBy: true },
  });
  if (!request || request.status !== "SIGNED" || !request.signedPdfHash) return NextResponse.json({ error: "Certificate not available" }, { status: 404 });

  const recipients = signatureRecipients(request.recipients).sort((a, b) => a.order - b.order);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  page.drawText("JUN", { x: 54, y: 730, size: 24, font: bold, color: rgb(0.05, 0.09, 0.17) });
  page.drawText("CERTIFICATE OF ELECTRONIC SIGNATURE", { x: 54, y: 699, size: 14, font: bold });
  page.drawText("JUN CREATIF AND TRAVEL LLC", { x: 54, y: 680, size: 10, font: regular, color: rgb(0.35, 0.39, 0.47) });

  const rows: [string, string][] = [
    ["Document", request.document.documentId],
    ["Title", request.document.title],
    ["Signature request", request.id],
    ["Provider", request.provider],
    ["Status", request.status],
    ["Activated / sent", fmt(request.sentAt)],
    ["Completed", fmt(request.completedAt)],
    ["Created by", `${request.createdBy.firstName} ${request.createdBy.lastName}`],
    ["Client", request.document.client ? `${request.document.client.firstName} ${request.document.client.lastName}` : "—"],
  ];

  let y = 642;
  for (const [label, value] of rows) {
    page.drawText(label, { x: 54, y, size: 9, font: bold, color: rgb(0.35, 0.39, 0.47) });
    page.drawText(String(value).slice(0, 85), { x: 180, y, size: 9, font: regular });
    y -= 20;
  }

  y -= 10;
  page.drawText("SIGNERS & IDENTITY EVIDENCE", { x: 54, y, size: 11, font: bold });
  y -= 24;
  for (const r of recipients) {
    page.drawText(`${r.order}. ${r.name}`, { x: 54, y, size: 10, font: bold });
    page.drawText(`${r.email}  ·  ${r.role ?? "SIGNER"}`, { x: 74, y: y - 15, size: 8.5, font: regular, color: rgb(0.35, 0.39, 0.47) });
    page.drawText(`Email verified: ${fmt(r.verifiedAt)}  ·  Signed: ${fmt(r.signedAt)}`, { x: 74, y: y - 29, size: 8.2, font: regular, color: rgb(0.35, 0.39, 0.47) });
    y -= 54;
  }

  y -= 4;
  page.drawText("DOCUMENT INTEGRITY", { x: 54, y, size: 11, font: bold });
  y -= 22;
  page.drawText("SHA-256", { x: 54, y, size: 9, font: bold, color: rgb(0.35, 0.39, 0.47) });
  const hash = request.signedPdfHash;
  page.drawText(hash.slice(0, 40), { x: 110, y, size: 8, font: mono });
  page.drawText(hash.slice(40), { x: 110, y: y - 13, size: 8, font: mono });

  page.drawText("This certificate records signer email verification, completion metadata and the cryptographic fingerprint of the signed PDF archived by JUN.", { x: 54, y: 74, size: 8, font: regular, color: rgb(0.35, 0.39, 0.47), maxWidth: 500 });
  page.drawText(`Generated ${fmt(new Date())}`, { x: 54, y: 54, size: 8, font: regular, color: rgb(0.35, 0.39, 0.47) });

  const bytes = await pdf.save();
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${request.document.documentId}-signature-certificate.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
