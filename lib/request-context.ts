import "server-only";
import { headers } from "next/headers";
import { logger, type Logger } from "@/lib/logger";

/**
 * Request-scoped helpers for server components, server actions and route handlers.
 * The `x-request-id` header is set by `middleware.ts` for every matched route.
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-request-id") ?? undefined;
  } catch {
    // headers() throws outside a request scope (e.g. build time, scripts).
    return undefined;
  }
}

/** Logger pre-bound with the current request id (when available). */
export async function requestLogger(extra: Record<string, unknown> = {}): Promise<Logger> {
  const requestId = await getRequestId();
  return logger.child(requestId ? { requestId, ...extra } : extra);
}
