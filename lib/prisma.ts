import { PrismaClient } from "@prisma/client";

// Server-only Prisma singleton. Use the native Supabase/Vercel pooled URL when available.
// Prisma's standard Node.js engine is intentionally used here to avoid an extra
// driver-adapter/query-compiler layer in the authentication path.
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
