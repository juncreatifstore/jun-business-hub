import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  getDrivePublicSecurity,
  publicAccessCookieName,
  publicLinkExpired,
  publicTokenMatches,
  signDrivePublicAccess,
} from "@/lib/drive-public-security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const key = String(form.get("key") ?? "");
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false, archivedAt: null }, select: { id: true } });
  if (!file) return NextResponse.redirect(new URL(`/view/file/${params.id}?error=unavailable`, req.url), 303);

  const security = await getDrivePublicSecurity(file.id);
  if (security.disabled || publicLinkExpired(security) || !publicTokenMatches(security, key || null) || !security.passwordHash) {
    return NextResponse.redirect(new URL(`/view/file/${file.id}${key ? `?key=${encodeURIComponent(key)}&error=unavailable` : "?error=unavailable"}`, req.url), 303);
  }

  const ok = await bcrypt.compare(password, security.passwordHash).catch(() => false);
  if (!ok) {
    const query = new URLSearchParams();
    if (key) query.set("key", key);
    query.set("error", "password");
    return NextResponse.redirect(new URL(`/view/file/${file.id}?${query.toString()}`, req.url), 303);
  }

  const token = await signDrivePublicAccess(file.id);
  const query = key ? `?key=${encodeURIComponent(key)}` : "";
  const response = NextResponse.redirect(new URL(`/view/file/${file.id}${query}`, req.url), 303);
  response.cookies.set(publicAccessCookieName(file.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });
  return response;
}
