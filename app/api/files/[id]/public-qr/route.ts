import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { getDrivePublicSecurity } from "@/lib/drive-public-security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await assertPermission("FILE_READ");
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false, archivedAt: null }, select: { id: true, name: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const security = await getDrivePublicSecurity(file.id);
  const publicUrl = new URL(`/view/file/${file.id}`, req.nextUrl.origin);
  if (security.token) publicUrl.searchParams.set("key", security.token);
  const png = await QRCode.toBuffer(publicUrl.toString(), { type: "png", width: 900, margin: 2, errorCorrectionLevel: "H" });
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${safeName}-public-link-qr.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
