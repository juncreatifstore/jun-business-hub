import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cloudOAuthConfig, isCloudAdmin, saveCloudConnection, verifyCloudOAuthState, type CloudProvider } from "@/lib/drive-cloud";

function providerOf(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!isCloudAdmin(user.role)) return NextResponse.redirect(new URL("/app/forbidden", req.url));
  const provider = providerOf(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown cloud provider" }, { status: 404 });

  const error = req.nextUrl.searchParams.get("error");
  if (error) return NextResponse.redirect(new URL(`/app/drive/cloud?error=${encodeURIComponent(error)}`, req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(new URL("/app/drive/cloud?error=oauth_missing_code", req.url));

  let verified: { userId: string; provider: CloudProvider };
  try { verified = await verifyCloudOAuthState(state); } catch { return NextResponse.redirect(new URL("/app/drive/cloud?error=oauth_invalid_state", req.url)); }
  if (verified.userId !== user.id || verified.provider !== provider) return NextResponse.redirect(new URL("/app/drive/cloud?error=oauth_identity_mismatch", req.url));

  const config = cloudOAuthConfig(provider);
  if (!config) return NextResponse.redirect(new URL(`/app/drive/cloud?error=${provider}_not_configured`, req.url));
  const redirectUri = new URL(`/api/drive/cloud/${provider}/callback`, req.url).toString();
  const paramsBody = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  let tokenEndpoint = "https://oauth2.googleapis.com/token";
  if (provider === "microsoft") {
    tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    paramsBody.set("scope", "offline_access User.Read Files.Read");
  }

  const tokenRes = await fetch(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: paramsBody });
  if (!tokenRes.ok) return NextResponse.redirect(new URL(`/app/drive/cloud?error=${provider}_token_exchange_failed`, req.url));
  const token = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

  let accountEmail = user.email;
  if (provider === "google") {
    const profile = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (profile.ok) {
      const p = await profile.json() as { email?: string };
      if (p.email) accountEmail = p.email;
    }
  } else {
    const profile = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (profile.ok) {
      const p = await profile.json() as { mail?: string; userPrincipalName?: string };
      accountEmail = p.mail || p.userPrincipalName || accountEmail;
    }
  }

  await saveCloudConnection({
    provider,
    userId: user.id,
    accountEmail,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || "",
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
    connectedAt: new Date().toISOString(),
    scopes: String(token.scope || "").split(/\s+/).filter(Boolean),
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "DRIVE_CLOUD_CONNECTED", resourceType: "CloudConnection", resourceId: provider, after: { provider, accountEmail } } }).catch(() => undefined);
  return NextResponse.redirect(new URL(`/app/drive/cloud?connected=${provider}`, req.url));
}
