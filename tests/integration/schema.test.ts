import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "./db";

/**
 * Sanity checks that the migrated database matches what the application assumes.
 * Schema/migration drift itself is caught by `prisma migrate diff --exit-code` in CI.
 */
describe("database schema", () => {
  afterAll(closeDb);

  it("answers SELECT 1", async () => {
    const rows = await db.$queryRaw<{ one: number }[]>`SELECT 1 AS one`;
    expect(rows[0].one).toBe(1);
  });

  it("has all migrations applied with no failed entries", async () => {
    const rows = await db.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`
      SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.finished_at, `${r.migration_name} not finished`).not.toBeNull();
      expect(r.rolled_back_at, `${r.migration_name} rolled back`).toBeNull();
    }
  });

  it("enforces unique user emails", async () => {
    const email = `dup-${Date.now()}@example.com`;
    await db.user.create({
      data: { email, firstName: "A", lastName: "B", passwordHash: "x", role: "VIEWER" } as never,
    });
    await expect(
      db.user.create({
        data: { email, firstName: "A", lastName: "B", passwordHash: "x", role: "VIEWER" } as never,
      }),
    ).rejects.toThrow();
    await db.user.deleteMany({ where: { email } });
  });
});
