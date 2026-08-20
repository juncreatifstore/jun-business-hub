import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function connectionMeta() {
  const candidates: Array<[string, string | undefined]> = [
    ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["DATABASE_URL", process.env.DATABASE_URL],
  ];
  const [source, value] = candidates.find(([, v]) => Boolean(v)) ?? ["NONE", undefined];
  if (!value) return { source, configured: false };
  try {
    const u = new URL(value);
    return {
      source,
      configured: true,
      protocol: u.protocol.replace(":", ""),
      host: u.hostname,
      port: u.port || "default",
      database: u.pathname.replace(/^\//, "") || null,
      hasSslMode: u.searchParams.has("sslmode"),
      hasPgbouncer: u.searchParams.has("pgbouncer"),
    };
  } catch {
    return { source, configured: true, parseable: false };
  }
}

function safeError(error: unknown) {
  const e = error as { name?: string; code?: string; message?: string; meta?: unknown };
  const message = String(e?.message ?? "");
  const patterns: Array<[RegExp, string]> = [
    [/password authentication failed|authentication failed/i, "DB_AUTH"],
    [/can't reach database server|cannot reach database server|P1001/i, "DB_UNREACHABLE"],
    [/ENOTFOUND|getaddrinfo|dns/i, "DB_DNS"],
    [/ECONNREFUSED|connection refused/i, "DB_REFUSED"],
    [/timeout|timed out/i, "DB_TIMEOUT"],
    [/prepared statement|pgbouncer/i, "DB_POOLER"],
    [/invalid.*connection string|error parsing connection string/i, "DB_URL_INVALID"],
    [/query engine|libssl|openssl/i, "PRISMA_ENGINE"],
  ];
  const category = patterns.find(([r]) => r.test(message))?.[1] ?? "PRISMA";
  return {
    category,
    name: e?.name ?? null,
    code: e?.code ?? null,
    message: message
      .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/password\s*=\s*[^\s]+/gi, "password=[REDACTED]")
      .slice(0, 500),
  };
}

export async function GET() {
  const meta = connectionMeta();
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: meta });
  } catch (error) {
    return NextResponse.json({ ok: false, database: meta, error: safeError(error) }, { status: 500 });
  }
}
