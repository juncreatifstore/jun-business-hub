import { NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { buildSignatureCertificate } from "@/lib/signature-certificate";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user || !can(user, "DOCUMENT_READ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const certificate = await buildSignatureCertificate(params.id);
  if (!certificate) return NextResponse.json({ error: "Certificate not available" }, { status: 404 });

  return new Response(Uint8Array.from(certificate.bytes).buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${certificate.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
