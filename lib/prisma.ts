import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Server-only Prisma singleton. Prefer the app-specific DATABASE_URL when present,
// but fall back to the native Supabase/Vercel integration variables so production
// does not depend on manually copied connection strings.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function pickConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

function createClient() {
  const connectionString = pickConnectionString();
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error(
      "No valid PostgreSQL connection string found. Expected DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL.",
    );
  }

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
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
