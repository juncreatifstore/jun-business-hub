import { PrismaClient } from "@prisma/client";

// Server-only Prisma singleton using Prisma's standard query engine.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function pickConnectionString() {
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

function normalizeConnectionString(raw: string) {
  if (!/^postgres(?:ql)?:\/\//i.test(raw)) {
    throw new Error(
      "No valid PostgreSQL connection string found. Expected POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL.",
    );
  }

  const url = new URL(raw);
  const isSupabaseTransactionPooler =
    /\.pooler\.supabase\.com$/i.test(url.hostname) && url.port === "6543";

  if (isSupabaseTransactionPooler) {
    if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
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
