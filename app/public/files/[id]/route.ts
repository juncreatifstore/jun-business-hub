import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import {
  getDrivePublicSecurity,
  publicAccessCookieName,
  publicLinkExpired,
  publicTokenMatches,
  recordDrivePublicAccess,
  requestPublicMeta,
  verifyDrivePublicAccess,
} from "@/lib/drive-public-security";
import { drivePublicPolicyAllows, getDriveEnterpriseSettings } from "@/lib/drive-enterprise";
import { drivePrivacyCookieName, getDrivePrivacyPolicy, verifyDrivePrivacyConsent } from "@/lib/drive-privacy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const suppliedToken = req.nextUrl.searchParams.get("key");
  const download = req.nextUrl.searchParams.get("download") === "1";
  const file = await prisma.file.findFirst({
    where: { id: params.id, isVault: false, archivedAt: null },
    select: { id: true, storageKey: true, mimeType: true, name: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [security, enterprise, privacy] = await Promise.all([
    getDrivePublicSecurity(file.id),
    getDriveEnterpriseSettings(),
    getDrivePrivacyPolicy(file.id),
  ]);
  if (security.disabled || publicLinkExpired(security) || !publicTokenMatches(security, suppliedToken) || !drivePublicPolicyAllows(enterprise, security)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (privacy.required) {
    const accepted = await verifyDrivePrivacyConsent(req.cookies.get(drivePrivacyCookieName(file.id))?.value, file.id, privacy.version);
    if (!accepted) return NextResponse.json({ error: "Confidentiality acceptance required" }, { status: 428 });
  }
  if (security.passwordHash) {
    const unlocked = await verifyDrivePublicAccess(req.cookies.get(publicAccessCookieName(file.id))?.value, file.id);
    if (!unlocked) return NextResponse.json({ error: "Password required" }, { status: 401 });
  }

  await recordDrivePublicAccess(file.id, download ? "FILE_PUBLIC_DOWNLOAD" : "FILE_PUBLIC_OPEN", {
    ...requestPublicMeta(req.headers),
    after: { download, privacyVersion: privacy.version },
  });

  if (process.env.STORAGE_DRIVER === "SUPABASE") {
    const url = await storage().getSignedUrl(file.storageKey, 300);
    const response = NextResponse.redirect(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  try {
    const buf = await storage().download(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    return NextResponse.json({ error: "File data unavailable" }, { status: 404 });
  }
}
