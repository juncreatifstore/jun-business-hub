import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { templatePlaceholders } from "@/lib/whatsapp";

describe("whatsapp template placeholders", () => {
  it("detects positional placeholders in order", () => {
    expect(templatePlaceholders("Bonjour {{2}}, lien {{1}}")).toEqual({ keys: ["1", "2"], named: false });
  });
  it("detects named placeholders (Meta default) in first-appearance order", () => {
    expect(templatePlaceholders("Bonjour {{ prenom }}, voici {{lien}} pour {{objet}}")).toEqual({
      keys: ["prenom", "lien", "objet"],
      named: true,
    });
  });
  it("dedupes repeated placeholders", () => {
    expect(templatePlaceholders("{{1}} et encore {{1}}").keys).toEqual(["1"]);
  });
});
