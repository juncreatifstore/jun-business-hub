import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mail-otp-sender", () => ({ resolveOtpSenderMailbox: vi.fn() }));
vi.mock("@/lib/google/gmail", () => ({ gmailSend: vi.fn() }));
vi.mock("@/lib/whatsapp-outreach", () => ({ sendWhatsAppLink: vi.fn() }));
vi.mock("@/lib/document-requirements", () => ({ caseChecklist: vi.fn() }));
import { parseItems, statusOf, docLabel, requestUrl } from "@/lib/document-requests";

describe("document requests", () => {
  it("parses items defensively", () => {
    const items = parseItems([
      { docType: "passport", required: true },
      { docType: "PHOTO", required: false, fileId: "f1", fileName: "a.jpg" },
      "junk",
      null,
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ docType: "PASSPORT", required: true, fileId: null });
    expect(items[1]).toMatchObject({ docType: "PHOTO", required: false, fileId: "f1" });
    expect(parseItems("nope")).toEqual([]);
  });
  it("computes status from required pieces", () => {
    expect(
      statusOf([
        { docType: "PASSPORT", required: true },
        { docType: "PHOTO", required: false },
      ]),
    ).toBe("PENDING");
    expect(
      statusOf([
        { docType: "PASSPORT", required: true, fileId: "x" },
        { docType: "PHOTO", required: false },
      ]),
    ).toBe("COMPLETE");
    expect(
      statusOf([
        { docType: "PASSPORT", required: true },
        { docType: "PHOTO", required: true, fileId: "x" },
      ]),
    ).toBe("PARTIAL");
    expect(statusOf([{ docType: "PHOTO", required: false, fileId: "x" }])).toBe("COMPLETE");
  });
  it("labels in both languages and builds the public url", () => {
    expect(docLabel("PASSPORT", "fr")).toBe("Passeport");
    expect(docLabel("PASSPORT", "en")).toBe("Passport");
    expect(requestUrl("abc")).toMatch(/\/r\/abc$/);
  });
});
