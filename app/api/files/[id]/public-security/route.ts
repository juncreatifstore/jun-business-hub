import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { getDrivePublicSecurity } from "@/lib/drive-public-security";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await assertPermission("FILE_READ");
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false }, select: { id: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const baseWhere = { resourceType: "File", resourceId: file.id } as const;
  const [security, events, views, opens, downloads] = await Promise.all([
    getDrivePublicSecurity(file.id),
    prisma.auditLog.findMany({
      where: { ...baseWhere, action: { in: ["FILE_PUBLIC_VIEW", "FILE_PUBLIC_OPEN", "FILE_PUBLIC_DOWNLOAD"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, createdAt: true, ip: true, userAgent: true },
    }),
    prisma.auditLog.count({ where: { ...baseWhere, action: "FILE_PUBLIC_VIEW" } }),
    prisma.auditLog.count({ where: { ...baseWhere, action: "FILE_PUBLIC_OPEN" } }),
    prisma.auditLog.count({ where: { ...baseWhere, action: "FILE_PUBLIC_DOWNLOAD" } }),
  ]);

  const publicUrl = new URL(`/view/file/${file.id}`, req.nextUrl.origin);
  if (security.token) publicUrl.searchParams.set("key", security.token);

  return NextResponse.json({
    disabled: security.disabled,
    expiresAt: security.expiresAt?.toISOString() ?? null,
    passwordProtected: Boolean(security.passwordHash),
    publicUrl: publicUrl.toString(),
    metrics: { views, opens, downloads, lastAccessAt: events[0]?.createdAt.toISOString() ?? null },
    recentAccess: events.map((e) => ({ id: e.id, action: e.action, createdAt: e.createdAt.toISOString(), ip: e.ip, userAgent: e.userAgent })),
  });
}
