import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client for integration tests. Uses DATABASE_URL directly
 * (no pooler tricks) — the CI database is a throwaway Postgres service.
 */
export const db = new PrismaClient();

export async function closeDb() {
  await db.$disconnect();
}
