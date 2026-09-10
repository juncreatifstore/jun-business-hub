import { afterAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { closeDb, db } from "./db";

/**
 * The dev seed is the reference dataset for local work and QA. If it drifts
 * from the schema or stops producing the documented accounts, everybody's
 * local setup breaks — so CI runs it on a fresh database and verifies it.
 */
describe("dev seed", () => {
  afterAll(closeDb);

  it("creates the documented SUPER_ADMIN with a valid bcrypt hash", async () => {
    const admin = await db.user.findUnique({ where: { email: "admin@juncreatif.org" } });
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe("SUPER_ADMIN");
    const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
    expect(await bcrypt.compare(password, admin!.passwordHash)).toBe(true);
  });

  it("creates the documented client-portal account scoped to a client", async () => {
    const portal = await db.user.findUnique({ where: { email: "aline.portal@example.com" } });
    expect(portal).not.toBeNull();
    expect(portal!.role).toBe("CLIENT");
    const account = await db.clientAccount.findFirst({ where: { userId: portal!.id } });
    expect(account?.clientId).toBeTruthy();
  });

  it("seeds every role and at least one permission", async () => {
    const roles = await db.role.findMany();
    expect(roles.map((r) => r.name)).toEqual(expect.arrayContaining(["SUPER_ADMIN", "VIEWER"]));
    expect(await db.permission.count()).toBeGreaterThan(0);
  });
});
