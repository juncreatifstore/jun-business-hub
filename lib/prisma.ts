import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Server-only Prisma singleton. In Vercel, prefer the connection strings injected
// by the Supabase integration. DATABASE_URL remains a fallback for non-Vercel/local use.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function pickConnectionString() {
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    ""
  );
}

function createClient() {
  const connectionString = pickConnectionString();
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error(
      "No valid PostgreSQL connection string found. Expected POSTGRES_PRISMA_URL, POSTGRES_URL, or DATABASE_URL.",
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
