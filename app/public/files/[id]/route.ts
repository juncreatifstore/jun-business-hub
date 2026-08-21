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

function parseRange(header: string | null, total: number) {
  if (!header || !header.startsWith("bytes=")) return null;
  const [startRaw, endRaw] = header.slice(6).split("-");
  const start = Number(startRaw);
  const requestedEnd = endRaw ? Number(endRaw) : Math.min(total - 1, start + 4 * 1024 * 1024 - 1);
  if (!Number.isFinite(start) || start < 0 || start >= total) return null;
  const end = Number.isFinite(requestedEnd) ? Math.min(total - 1, requestedEnd) : total - 1;
  if (end < start) return null;
  return { start, end };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const suppliedToken = req.nextUrl.searchParams.get("key");
  const download = req.nextUrl.searchParams.get("download") === "1";
  const file = await prisma.file.findFirst({
    where: { id: params.id, isVault: false, archivedAt: null },
    select: { id: true, storageKey: true, mimeType: true, name: true, sizeBytes: true },
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

  const rangeHeader = req.headers.get("range");
  await recordDrivePublicAccess(file.id, download ? "FILE_PUBLIC_DOWNLOAD" : "FILE_PUBLIC_OPEN", {
    ...requestPublicMeta(req.headers),
    after: { download, privacyVersion: privacy.version, ranged: Boolean(rangeHeader) },
  });

  if ((process.env.STORAGE_DRIVER ?? "").toUpperCase() === "SUPABASE") {
    const url = await storage().getSignedUrl(file.storageKey, 300);
    const response = NextResponse.redirect(url);
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  try {
    const driver = storage();
    const range = !download ? parseRange(rangeHeader, file.sizeBytes) : null;
    if (range && driver.downloadRange) {
      const buf = await driver.downloadRange(file.storageKey, range.start, range.end);
      return new NextResponse(new Uint8Array(buf), {
        status: 206,
        headers: {
          "Content-Type": file.mimeType,
          "Content-Length": String(buf.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${file.sizeBytes}`,
          "Accept-Ranges": "bytes",
          "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      });
    }
    const buf = await driver.download(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(buf.length),
        "Accept-Ranges": driver.downloadRange && !download ? "bytes" : "none",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.name.replace(/[^a-zA-Z0-9._ -]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch {
    return NextResponse.json({ error: "File data unavailable" }, { status: 404 });
  }
}
