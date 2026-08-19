import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Edge middleware: first line of defense for /app, /client and sensitive APIs.
// Real authorization (RBAC/permissions) is enforced again server-side in every
// page and server action — the middleware only handles authentication routing.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isStaffArea = pathname.startsWith("/app") || pathname.startsWith("/api/files");
  const isClientArea = pathname.startsWith("/client");

  if ((isStaffArea || isClientArea) && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isStaffArea && session?.role === "CLIENT") {
    return NextResponse.redirect(new URL("/client", req.url));
  }

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(session.role === "CLIENT" ? "/client" : "/app", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/client/:path*", "/login", "/api/files/:path*"],
};
