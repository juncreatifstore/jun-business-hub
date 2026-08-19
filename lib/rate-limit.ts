type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  return memoryLimit(key, limit, windowMs);
}

export async function rateLimitAsync(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (process.env.RATE_LIMIT_PROVIDER === "UPSTASH") {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      try {
        const res = await fetch(`${url}/pipeline`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify([["INCR", `rl:${key}`], ["PEXPIRE", `rl:${key}`, String(windowMs), "NX"]]),
        });
        if (res.ok) {
          const data = (await res.json()) as { result: number }[];
          return Number(data?.[0]?.result ?? 0) <= limit;
        }
      } catch (e) {
        console.error("rate-limit provider error (failing open):", e);
      }
      return true;
    }
  }
  return memoryLimit(key, limit, windowMs);
}
