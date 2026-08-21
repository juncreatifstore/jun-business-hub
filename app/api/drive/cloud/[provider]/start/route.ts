import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cloudOAuthConfig, isCloudAdmin, signCloudOAuthState, type CloudProvider } from "@/lib/drive-cloud";

function providerOf(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!isCloudAdmin(user.role)) return NextResponse.redirect(new URL("/app/forbidden", req.url));
  const provider = providerOf(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown cloud provider" }, { status: 404 });
  const config = cloudOAuthConfig(provider);
  if (!config) return NextResponse.redirect(new URL(`/app/drive/cloud?error=${provider}_not_configured`, req.url));

  const state = await signCloudOAuthState(user.id, provider);
  const redirectUri = new URL(`/api/drive/cloud/${provider}/callback`, req.url).toString();
  let url: URL;
  if (provider === "google") {
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", "openid email https://www.googleapis.com/auth/drive.readonly");
    url.searchParams.set("state", state);
  } else {
    url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", "offline_access User.Read Files.Read");
    url.searchParams.set("state", state);
  }
  return NextResponse.redirect(url);
}
