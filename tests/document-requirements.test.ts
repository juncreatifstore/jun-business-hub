import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { appSetting: { findUnique: vi.fn(async () => null) } } }));
import { DEFAULT_PROFILES, profileForCaseType, loadRequirementProfiles } from "@/lib/document-requirements";

describe("document requirement profiles", () => {
  it("matches free-text case types by keyword, accent-insensitive", () => {
    expect(profileForCaseType(DEFAULT_PROFILES, "Visa Schengen touristique").key).toBe("tourist_visa");
    expect(profileForCaseType(DEFAULT_PROFILES, "Regroupement familial").key).toBe("family");
    expect(profileForCaseType(DEFAULT_PROFILES, "Permis d'étude Canada").key).toBe("student_visa");
    expect(profileForCaseType(DEFAULT_PROFILES, "Travel").key).toBe("travel");
    expect(profileForCaseType(DEFAULT_PROFILES, "refund").key).toBe("refund");
    expect(profileForCaseType(DEFAULT_PROFILES, "").key).toBe("default");
  });
  it("every profile requires at least one identity piece except refund/documents", () => {
    for (const p of DEFAULT_PROFILES) {
      if (["refund", "documents"].includes(p.key)) continue;
      expect(p.required).toContain("PASSPORT");
    }
  });
  it("falls back to defaults when nothing is stored", async () => {
    const profiles = await loadRequirementProfiles();
    expect(profiles).toEqual(DEFAULT_PROFILES);
  });
});
