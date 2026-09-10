import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return await import("@/lib/logger");
}

describe("logger", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emits one JSON object per line in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const { logger } = await load();
    logger.info("login.success", { userId: "u1" });
    expect(out).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(out.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "info", msg: "login.success", userId: "u1" });
    expect(typeof parsed.ts).toBe("string");
  });

  it("redacts secret-looking keys recursively", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const out = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await load();
    logger.error("gmail.connect.failed", { password: "hunter2", nested: { refresh_token: "abc", ok: 1 } });
    const parsed = JSON.parse(out.mock.calls[0][0] as string);
    expect(parsed.password).toBe("[redacted]");
    expect(parsed.nested.refresh_token).toBe("[redacted]");
    expect(parsed.nested.ok).toBe(1);
  });

  it("serializes Error objects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const out = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await load();
    logger.error("boom", { err: new TypeError("bad") });
    const parsed = JSON.parse(out.mock.calls[0][0] as string);
    expect(parsed.err).toMatchObject({ name: "TypeError", message: "bad" });
  });

  it("child loggers carry context and respect LOG_LEVEL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "warn");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await load();
    const child = logger.child({ requestId: "r1" });
    child.info("ignored");
    child.warn("kept");
    expect(log).not.toHaveBeenCalled();
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({ requestId: "r1", msg: "kept" });
  });
});
