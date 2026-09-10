/**
 * Rate limiting.
 *
 * Two providers:
 *  - UPSTASH (Redis REST): distributed, correct on Vercel/serverless. REQUIRED in
 *    production for security-critical limits (login, MFA, password reset).
 *  - MEMORY: per-process Map. Fine for local dev. On serverless it is almost
 *    useless (one counter per instance, reset on every cold start), so it is
 *    only accepted in production for non-security limits, with a warning.
 *
 * Policy:
 *  - `critical: true` limits FAIL CLOSED: if the provider is unavailable or
 *    misconfigured, the request is denied. Better to block a login for a minute
 *    than to let a credential-stuffing run through.
 *  - Non-critical limits fail open (UX features like AI drafts, Gmail sync).
 */

import { logger } from "@/lib/logger";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_MEMORY_BUCKETS = 10_000;

export type RateLimitOptions = {
  /** Security-sensitive limit: requires a distributed provider in production and fails closed. */
  critical?: boolean;
};

export type RateLimitResult = {
  ok: boolean;
  /** Remaining requests in the window (best effort, -1 if unknown). */
  remaining: number;
  /** Which provider answered. */
  provider: "UPSTASH" | "MEMORY" | "DENIED";
};

const isProd = process.env.NODE_ENV === "production";
let memoryWarned = false;

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (buckets.size > MAX_MEMORY_BUCKETS) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, provider: "MEMORY" };
  }
  if (b.count >= limit) return { ok: false, remaining: 0, provider: "MEMORY" };
  b.count += 1;
  return { ok: true, remaining: limit - b.count, provider: "MEMORY" };
}

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.RATE_LIMIT_PROVIDER === "UPSTASH" && url && token) return { url, token };
  return null;
}

async function upstashLimit(
  cfg: { url: string; token: string },
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"],
      ]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: number }[];
    const count = Number(data?.[0]?.result ?? NaN);
    if (!Number.isFinite(count)) return null;
    return { ok: count <= limit, remaining: Math.max(0, limit - count), provider: "UPSTASH" };
  } catch (e) {
    logger.error("rate_limit.provider_unreachable", { provider: "UPSTASH", err: e });
    return null;
  }
}

/**
 * Check and consume one unit of `key`'s budget.
 * Returns the full result; use `checkRateLimit(...).ok` or the `rateLimitAsync` boolean shortcut.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const cfg = upstashConfig();

  if (cfg) {
    const result = await upstashLimit(cfg, key, limit, windowMs);
    if (result) return result;
    if (opts.critical) {
      logger.error("rate_limit.fail_closed", { key, reason: "provider_failure" });
      return { ok: false, remaining: 0, provider: "DENIED" };
    }
    return memoryLimit(key, limit, windowMs);
  }

  if (isProd) {
    if (opts.critical) {
      logger.error("rate_limit.fail_closed", {
        key,
        reason: "no_distributed_provider",
        hint: "Set RATE_LIMIT_PROVIDER=UPSTASH, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN",
      });
      return { ok: false, remaining: 0, provider: "DENIED" };
    }
    if (!memoryWarned) {
      memoryWarned = true;
      logger.warn("rate_limit.memory_in_production", {
        hint: "MEMORY provider is per-instance and resets on cold start; configure Upstash",
      });
    }
  }

  return memoryLimit(key, limit, windowMs);
}

/** Boolean shortcut kept for existing call sites. */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
  opts: RateLimitOptions = {},
): Promise<boolean> {
  return (await checkRateLimit(key, limit, windowMs, opts)).ok;
}

/**
 * @deprecated Synchronous, memory-only. Use `rateLimitAsync` so the distributed
 * provider is honoured. Kept for backwards compatibility.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  return memoryLimit(key, limit, windowMs).ok;
}

/** Test helper. */
export function _resetRateLimitMemory() {
  buckets.clear();
}
