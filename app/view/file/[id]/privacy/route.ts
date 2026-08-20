import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { drivePrivacyCookieName, getDrivePrivacyPolicy, signDrivePrivacyConsent } from "@/lib/drive-privacy";
import { requestPublicMeta } from "@/lib/drive-public-security";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false, archivedAt: null }, select: { id: true, name: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const accepted = String(form.get("accepted") ?? "") === "1";
  const key = String(form.get("key") ?? "").trim();
  if (!accepted) {
    const url = new URL(`/view/file/${file.id}`, req.url);
    if (key) url.searchParams.set("key", key);
    url.searchParams.set("privacy_error", "required");
    return NextResponse.redirect(url, 303);
  }

  const policy = await getDrivePrivacyPolicy(file.id);
  const token = await signDrivePrivacyConsent(file.id, policy.version);
  const meta = requestPublicMeta(req.headers);
  await prisma.auditLog.create({
    data: {
      userId: null,
      action: "FILE_PUBLIC_PRIVACY_ACCEPTED",
      resourceType: "File",
      resourceId: file.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      after: { policyVersion: policy.version, policyTitle: policy.title },
    },
  }).catch(() => undefined);

  const url = new URL(`/view/file/${file.id}`, req.url);
  if (key) url.searchParams.set("key", key);
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(drivePrivacyCookieName(file.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/`,
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
