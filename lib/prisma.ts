import { PrismaClient } from "@prisma/client";

// Server-only Prisma singleton using Prisma's standard query engine.
// This avoids the query_compiler_bg.wasm runtime dependency that was missing
// from Vercel when engineType = "client" + @prisma/adapter-pg was used.
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
