import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Liveness + readiness probe for Vercel checks and uptime monitors.
 * Deliberately terse: returns ok/fail per dependency and latency, never
 * configuration values, connection strings or error messages.
 *
 *   200 { status: "ok",       checks: { db: {ok, ms}, storage: {ok}, rateLimit: {ok, provider} } }
 *   503 { status: "degraded", checks: { ... } }
 */

type Check = { ok: boolean; ms?: number; provider?: string };

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function checkDb(): Promise<Check> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3_000);
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    logger.error("health.db_failed", { err });
    return { ok: false, ms: Date.now() - start };
  }
}

function checkStorage(): Check {
  const driver = process.env.STORAGE_DRIVER ?? "LOCAL";
  if (driver === "SUPABASE") {
    const ok = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    return { ok, provider: "SUPABASE" };
  }
  // LOCAL is only acceptable outside production.
  return { ok: process.env.NODE_ENV !== "production", provider: "LOCAL" };
}

function checkRateLimit(): Check {
  const upstash =
    process.env.RATE_LIMIT_PROVIDER === "UPSTASH" &&
    Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  if (upstash) return { ok: true, provider: "UPSTASH" };
  // Without a distributed provider, critical auth limits fail closed in production.
  return { ok: process.env.NODE_ENV !== "production", provider: "MEMORY" };
}

function checkAuthSecret(): Check {
  const s = process.env.AUTH_SECRET ?? "";
  return { ok: process.env.NODE_ENV !== "production" || s.length >= 32 };
}

export async function GET() {
  const [db] = await Promise.all([checkDb()]);
  const checks = { db, storage: checkStorage(), rateLimit: checkRateLimit(), authSecret: checkAuthSecret() };
  const healthy = Object.values(checks).every((c) => c.ok);
  const body = {
    status: healthy ? "ok" : "degraded",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    checks,
  };
  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
