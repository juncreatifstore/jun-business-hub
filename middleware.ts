import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Edge middleware: first line of defense for /app, /client and sensitive APIs.
// Real authorization (RBAC/permissions) is enforced again server-side in every
// page and server action — the middleware only handles authentication routing.
const REQUEST_ID_HEADER = "x-request-id";

function requestId(req: NextRequest) {
  const incoming = req.headers.get(REQUEST_ID_HEADER);
  // Accept a sane upstream id (Vercel/proxies), otherwise mint one.
  if (incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

function withRequestId(res: NextResponse, id: string) {
  res.headers.set(REQUEST_ID_HEADER, id);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const id = requestId(req);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  const isStaffArea = pathname.startsWith("/app") || pathname.startsWith("/api/files");
  const isClientArea = pathname.startsWith("/client");

  if ((isStaffArea || isClientArea) && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withRequestId(NextResponse.redirect(url), id);
  }

  if (isStaffArea && session?.role === "CLIENT") {
    return withRequestId(NextResponse.redirect(new URL("/client", req.url)), id);
  }

  if (pathname === "/login" && session) {
    return withRequestId(
      NextResponse.redirect(new URL(session.role === "CLIENT" ? "/client" : "/app", req.url)),
      id,
    );
  }

  // Forward the id to server components / route handlers via request headers,
  // and echo it to the client so support tickets can reference it.
  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, id);
  return withRequestId(NextResponse.next({ request: { headers } }), id);
}

export const config = {
  matcher: ["/app/:path*", "/client/:path*", "/login", "/api/:path*"],
};
