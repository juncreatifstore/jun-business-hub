import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { getDrivePublicSecurity } from "@/lib/drive-public-security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await assertPermission("FILE_READ");
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false }, select: { id: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [security, events] = await Promise.all([
    getDrivePublicSecurity(file.id),
    prisma.auditLog.findMany({
      where: { resourceType: "File", resourceId: file.id, action: { in: ["FILE_PUBLIC_VIEW", "FILE_PUBLIC_OPEN", "FILE_PUBLIC_DOWNLOAD"] } },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: { id: true, action: true, createdAt: true, ip: true, userAgent: true },
    }),
  ]);

  const views = events.filter((e) => e.action === "FILE_PUBLIC_VIEW").length;
  const opens = events.filter((e) => e.action === "FILE_PUBLIC_OPEN").length;
  const downloads = events.filter((e) => e.action === "FILE_PUBLIC_DOWNLOAD").length;
  const publicUrl = new URL(`/view/file/${file.id}`, req.nextUrl.origin);
  if (security.token) publicUrl.searchParams.set("key", security.token);

  return NextResponse.json({
    disabled: security.disabled,
    expiresAt: security.expiresAt?.toISOString() ?? null,
    passwordProtected: Boolean(security.passwordHash),
    publicUrl: publicUrl.toString(),
    metrics: { views, opens, downloads, lastAccessAt: events[0]?.createdAt.toISOString() ?? null },
    recentAccess: events.slice(0, 20).map((e) => ({ id: e.id, action: e.action, createdAt: e.createdAt.toISOString(), ip: e.ip, userAgent: e.userAgent })),
  });
}
