/**
 * Structured JSON logger — zero dependency, works in Node and Edge runtimes.
 *
 * Every line is one JSON object: { ts, level, msg, ...fields }. Vercel, Datadog,
 * Logtail, Axiom, etc. parse this natively, which makes filtering by
 * `requestId`, `userId` or `event` trivial. In development the output is
 * pretty-printed instead.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("login.success", { userId });
 *   logger.error("login.failed", { userId, err });
 *   const log = logger.child({ requestId });
 *
 * Secrets: any field whose key matches REDACT_KEYS is replaced by "[redacted]",
 * recursively. Errors are serialized to { name, message, stack }.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type LogFields = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const REDACT_KEYS =
  /^(password|pass|pwd|secret|token|authorization|cookie|apikey|api_key|private_key|refresh_token|access_token|otp|code|recovery)$/i;

function minLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase() as LogLevel;
  if (env in LEVEL_RANK) return env;
  if (process.env.NODE_ENV === "production") return "info";
  if (process.env.NODE_ENV === "test") return "silent"; // opt in with LOG_LEVEL=debug
  return "debug";
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...((err as { cause?: unknown }).cause !== undefined
        ? { cause: sanitize((err as { cause?: unknown }).cause, 0) }
        : {}),
    };
  }
  return err;
}

function sanitize(value: unknown, depth: number): unknown {
  if (depth > 6) return "[depth]";
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.test(k) ? "[redacted]" : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function emit(level: LogLevel, msg: string, fields: LogFields, context: LogFields) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(sanitize(context, 0) as LogFields),
    ...(sanitize(fields, 0) as LogFields),
  };
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  if (process.env.NODE_ENV === "production" || process.env.LOG_FORMAT === "json") {
    sink(JSON.stringify(record));
  } else {
    const { ts, level: l, msg: m, ...rest } = record;
    sink(`${ts} ${l.toUpperCase().padEnd(5)} ${m}`, Object.keys(rest).length ? rest : "");
  }
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(context: LogFields): Logger;
}

function make(context: LogFields): Logger {
  return {
    debug: (msg, fields = {}) => emit("debug", msg, fields, context),
    info: (msg, fields = {}) => emit("info", msg, fields, context),
    warn: (msg, fields = {}) => emit("warn", msg, fields, context),
    error: (msg, fields = {}) => emit("error", msg, fields, context),
    child: (extra) => make({ ...context, ...extra }),
  };
}

export const logger: Logger = make({});
