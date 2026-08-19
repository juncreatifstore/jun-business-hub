import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from "@/lib/permissions";

describe("RBAC role → permission mapping", () => {
  it("SUPER_ADMIN and DIRECTOR hold every permission", () => {
    for (const p of PERMISSIONS) {
      expect(roleHasPermission("SUPER_ADMIN", p)).toBe(true);
      expect(roleHasPermission("DIRECTOR", p)).toBe(true);
    }
  });

  it("ADMIN holds everything except VAULT_MANAGE", () => {
    expect(roleHasPermission("ADMIN", "VAULT_MANAGE")).toBe(false);
    expect(roleHasPermission("ADMIN", "TEAM_MANAGE")).toBe(true);
    expect(roleHasPermission("ADMIN", "PAYMENT_APPROVE")).toBe(true);
  });

  it("CLIENT role has zero staff permissions", () => {
    expect(ROLE_PERMISSIONS.CLIENT).toHaveLength(0);
    for (const p of PERMISSIONS) expect(roleHasPermission("CLIENT", p)).toBe(false);
  });

  it("VIEWER is read-only: no create/update/approve/manage", () => {
    for (const p of ROLE_PERMISSIONS.VIEWER) {
      expect(p.endsWith("_READ")).toBe(true);
    }
    expect(roleHasPermission("VIEWER", "PAYMENT_APPROVE")).toBe(false);
    expect(roleHasPermission("VIEWER", "DOCUMENT_SIGN")).toBe(false);
  });

  it("only FINANCE-tier roles (and full admins) can approve payments", () => {
    const approvers = (Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[])
      .filter((r) => roleHasPermission(r, "PAYMENT_APPROVE"));
    expect(approvers.sort()).toEqual(["ADMIN", "DIRECTOR", "FINANCE", "SUPER_ADMIN"].sort());
  });

  it("AI approval is restricted to management-level roles", () => {
    expect(roleHasPermission("MANAGER", "AI_APPROVE")).toBe(true);
    expect(roleHasPermission("TRAVEL_AGENT", "AI_APPROVE")).toBe(false);
    expect(roleHasPermission("VIEWER", "AI_APPROVE")).toBe(false);
  });

  it("unknown permission is denied for every role", () => {
    // @ts-expect-error — intentionally invalid code
    expect(roleHasPermission("ADMIN", "TOTALLY_FAKE")).toBe(false);
  });
});
