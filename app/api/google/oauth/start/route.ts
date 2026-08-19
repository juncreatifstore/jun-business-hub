import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, can } from "@/lib/auth";
import { googleConfigured, googleAuthUrl } from "@/lib/google/gmail";
import { signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts the Gmail OAuth flow. SETTINGS_MANAGE only. State = signed JWT (CSRF protection). */
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can(user, "SETTINGS_MANAGE")) {
    return NextResponse.redirect(new URL("/app/forbidden", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/app/settings/email?toast_error=Google OAuth is not configured (GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI)", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }
  const state = await signSession({ sub: user.id, role: "GOOGLE_OAUTH_STATE" });
  return NextResponse.redirect(googleAuthUrl(state));
}
