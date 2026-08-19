import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { verifySession } from "@/lib/session";
import { exchangeCode, saveConnectedAccount } from "@/lib/google/gmail";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const user = await getCurrentUser();
  if (!user || !can(user, "SETTINGS_MANAGE")) return NextResponse.redirect(new URL("/app/forbidden", base));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const err = req.nextUrl.searchParams.get("error");
  if (err) return NextResponse.redirect(new URL(`/app/settings/email?toast_error=Google: ${err}`, base));

  // CSRF: state must be a JWT we signed, for THIS user.
  const payload = state ? await verifySession(state) : null;
  if (!payload || payload.role !== "GOOGLE_OAUTH_STATE" || payload.sub !== user.id) {
    return NextResponse.redirect(new URL("/app/settings/email?toast_error=Invalid OAuth state — try again", base));
  }
  if (!code) return NextResponse.redirect(new URL("/app/settings/email?toast_error=Missing authorization code", base));

  try {
    const t = await exchangeCode(code);
    const acc = await saveConnectedAccount({ ...t, connectedById: user.id });
    await audit({ userId: user.id, action: "MAILBOX_CONNECTED", resourceType: "MailAccount", resourceId: acc.id, after: { email: acc.email, provider: "GOOGLE" } });
    return NextResponse.redirect(new URL(`/app/settings/email?toast=${encodeURIComponent(`${acc.email} connected`)}`, base));
  } catch (e) {
    return NextResponse.redirect(new URL(`/app/settings/email?toast_error=${encodeURIComponent(e instanceof Error ? e.message : "OAuth failed")}`, base));
  }
}
