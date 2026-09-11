import { PrismaClient } from "@prisma/client";

// Server-only Prisma singleton using Prisma's standard query engine.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function pickConnectionString() {
  return process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
}

function normalizeConnectionString(raw: string) {
  if (!/^postgres(?:ql)?:\/\//i.test(raw)) {
    throw new Error(
      "No valid PostgreSQL connection string found. Expected POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL.",
    );
  }

  const url = new URL(raw);
  const isSupabaseTransactionPooler = /\.pooler\.supabase\.com$/i.test(url.hostname) && url.port === "6543";

  if (isSupabaseTransactionPooler) {
    if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    // A small per-instance pool: pages fan out 3–5 queries with Promise.all and
    // a single connection made them queue and time out (P2024). The Supabase
    // transaction pooler multiplexes these cheaply; override with
    // PRISMA_CONNECTION_LIMIT if the pooler's client cap is ever reached.
    if (!url.searchParams.has("connection_limit"))
      url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT || "5");
    if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "20");
    if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  }

  return url.toString();
}

function createClient() {
  const connectionString = normalizeConnectionString(pickConnectionString());
  return new PrismaClient({
    datasources: { db: { url: connectionString } },
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_t, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
