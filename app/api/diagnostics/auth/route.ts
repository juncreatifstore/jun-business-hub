import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function classifyError(error: unknown) {
  const e = error as { name?: string; code?: string; message?: string };
  const message = String(e?.message ?? "");
  let kind = "unknown";
  if (/password authentication failed|authentication failed/i.test(message)) kind = "db_auth";
  else if (/ENOTFOUND|getaddrinfo|dns/i.test(message)) kind = "db_dns";
  else if (/ECONNREFUSED|connection refused/i.test(message)) kind = "db_refused";
  else if (/timeout|timed out/i.test(message)) kind = "db_timeout";
  else if (/DATABASE_URL is not set/i.test(message)) kind = "database_url_missing";
  else if (/AUTH_SECRET is required/i.test(message)) kind = "auth_secret_missing";
  else if (/prepared statement|pgbouncer/i.test(message)) kind = "pooler_config";
  else if (/prisma/i.test(String(e?.name ?? "")) || /Prisma/i.test(message)) kind = "prisma";
  return { kind, name: e?.name ?? "Error", code: e?.code ?? null };
}

export async function GET() {
  const checks: Record<string, unknown> = {
    databaseUrlPresent: Boolean(process.env.DATABASE_URL),
    databaseUrlLooksPostgres: /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? ""),
    directUrlPresent: Boolean(process.env.DIRECT_URL),
    authSecretPresent: Boolean(process.env.AUTH_SECRET),
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const count = await prisma.user.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
    checks.database = "ok";
    checks.activeSuperAdminCount = count;
  } catch (error) {
    checks.database = "error";
    checks.databaseError = classifyError(error);
  }

  try {
    const token = await signSession({ sub: "diagnostic", role: "SUPER_ADMIN" });
    checks.sessionSigning = token ? "ok" : "error";
  } catch (error) {
    checks.sessionSigning = "error";
    checks.sessionError = classifyError(error);
  }

  const ok = checks.database === "ok" && checks.sessionSigning === "ok";
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
