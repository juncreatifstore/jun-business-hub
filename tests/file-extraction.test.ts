import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { docTypeOf, parseLooseDate, expiryStatus, DOC_TYPES } from "@/lib/file-extraction";

describe("file extraction helpers", () => {
  it("normalises document types and falls back to OTHER", () => {
    expect(docTypeOf("passport")).toBe("PASSPORT");
    expect(docTypeOf("Flight Ticket")).toBe("FLIGHT_TICKET");
    expect(docTypeOf("unknown thing")).toBe("OTHER");
    expect(docTypeOf(null)).toBe("OTHER");
    expect(DOC_TYPES).toContain("RESIDENCE_PERMIT");
  });
  it("parses ISO, dd/mm/yyyy and textual dates, rejects placeholders", () => {
    expect(parseLooseDate("2027-03-14")?.toISOString().slice(0, 10)).toBe("2027-03-14");
    expect(parseLooseDate("14/03/2027")?.toISOString().slice(0, 10)).toBe("2027-03-14");
    expect(parseLooseDate("March 14, 2027")?.getUTCFullYear()).toBe(2027);
    expect(parseLooseDate("unknown")).toBeNull();
    expect(parseLooseDate("")).toBeNull();
    expect(parseLooseDate("1800-01-01")).toBeNull();
  });
  it("classifies expiry status", () => {
    const d = (days: number) => new Date(Date.now() + days * 86_400_000);
    expect(expiryStatus(null)).toBeNull();
    expect(expiryStatus(d(-1))).toBe("expired");
    expect(expiryStatus(d(10))).toBe("critical");
    expect(expiryStatus(d(60))).toBe("soon");
    expect(expiryStatus(d(200))).toBe("ok");
  });
});
