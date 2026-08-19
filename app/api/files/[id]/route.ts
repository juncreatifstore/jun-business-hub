import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, can } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { clientCanAccessFile } from "@/lib/portal";

export const dynamic = "force-dynamic";

/**
 * Authenticated file download.
 * - Staff need FILE_READ (VAULT_READ for vault files).
 * - CLIENT users can only access files linked to their own client record.
 * - Supabase: redirect to a short-lived signed URL. Local dev: stream the file.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = await prisma.file.findUnique({ where: { id: params.id } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (user.role === "CLIENT") {
    const account = await prisma.clientAccount.findUnique({ where: { userId: user.id } });
    if (!account || !clientCanAccessFile(file, account.clientId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (file.isVault && !can(user, "VAULT_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!file.isVault && !can(user, "FILE_READ")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Every download is audited; Vault access gets its own high-visibility action name.
  await audit({
    userId: user.id,
    action: file.isVault ? "VAULT_FILE_ACCESS" : "FILE_DOWNLOAD",
    resourceType: "File",
    resourceId: file.id,
    after: { name: file.name, isVault: file.isVault },
  });

  if (process.env.STORAGE_DRIVER === "SUPABASE") {
    const url = await storage().getSignedUrl(file.storageKey, 300);
    return NextResponse.redirect(url);
  }

  try {
    const buf = await storage().download(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File data unavailable" }, { status: 404 });
  }
}
