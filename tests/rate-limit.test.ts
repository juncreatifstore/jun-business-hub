import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return await import("@/lib/rate-limit");
}

describe("rate-limit", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("MEMORY: allows up to the limit then blocks within the window", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { checkRateLimit, _resetRateLimitMemory } = await load();
    _resetRateLimitMemory();
    for (let i = 0; i < 3; i++) expect((await checkRateLimit("k", 3, 60_000)).ok).toBe(true);
    const blocked = await checkRateLimit("k", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.provider).toBe("MEMORY");
  });

  it("production + critical + no distributed provider => DENIED (fail closed)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_PROVIDER", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkRateLimit } = await load();
    const r = await checkRateLimit("login:1.2.3.4", 10, 60_000, { critical: true });
    expect(r.ok).toBe(false);
    expect(r.provider).toBe("DENIED");
  });

  it("production + non-critical + no provider => falls back to MEMORY with a warning", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_PROVIDER", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { checkRateLimit } = await load();
    const r = await checkRateLimit("ai:u1", 10, 60_000);
    expect(r.ok).toBe(true);
    expect(r.provider).toBe("MEMORY");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("UPSTASH: uses the Redis counter", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_PROVIDER", "UPSTASH");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    let count = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => [{ result: ++count }, { result: 1 }] })),
    );
    const { checkRateLimit } = await load();
    expect((await checkRateLimit("login:x", 2, 60_000, { critical: true })).ok).toBe(true);
    expect((await checkRateLimit("login:x", 2, 60_000, { critical: true })).ok).toBe(true);
    const third = await checkRateLimit("login:x", 2, 60_000, { critical: true });
    expect(third.ok).toBe(false);
    expect(third.provider).toBe("UPSTASH");
  });

  it("UPSTASH down + critical => DENIED; non-critical => MEMORY fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RATE_LIMIT_PROVIDER", "UPSTASH");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "t");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const { checkRateLimit } = await load();
    expect((await checkRateLimit("mfa:x", 10, 60_000, { critical: true })).provider).toBe("DENIED");
    expect((await checkRateLimit("gmail-sync:u", 10, 60_000)).provider).toBe("MEMORY");
  });
});
