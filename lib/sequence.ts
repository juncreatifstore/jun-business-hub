import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Generate a yearly sequential registry number without relying on a dedicated
 * SequenceCounter Prisma model. Counters are stored in AppSetting and protected
 * by a PostgreSQL transaction-level advisory lock so concurrent requests cannot
 * receive the same number.
 */
export async function nextNumber(prefix: string, width = 6): Promise<string> {
  const year = new Date().getFullYear();
  const id = `${prefix}-${year}`;
  const key = `sequence.${id}`;

  const value = await prisma.$transaction(async (tx) => {
    // Serialize increments for this specific sequence key.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    const current = await tx.appSetting.findUnique({ where: { key } });
    const previous = current ? Number.parseInt(current.value, 10) : 0;
    const next = Number.isFinite(previous) && previous >= 0 ? previous + 1 : 1;

    await tx.appSetting.upsert({
      where: { key },
      create: { key, value: String(next) },
      update: { value: String(next) },
    });

    return next;
  });

  return `${id}-${String(value).padStart(width, "0")}`;
}

export { DOC_PREFIX } from "@/lib/registry";
