import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mail-otp-sender", () => ({ resolveOtpSenderMailbox: vi.fn() }));
vi.mock("@/lib/google/gmail", () => ({ gmailSend: vi.fn() }));
vi.mock("@/lib/whatsapp-outreach", () => ({ sendWhatsAppLink: vi.fn() }));
vi.mock("@/lib/document-requests", () => ({ appBaseUrl: () => "https://example.test" }));
import { addBusinessDays, reasonLabel, payoutLabel, claimUrl, REASON_CODES } from "@/lib/refund-claims";

describe("refund claims", () => {
  it("adds business days skipping weekends", () => {
    const monday = new Date(Date.UTC(2026, 8, 14)); // Monday
    const due = addBusinessDays(monday, 5);
    expect(due.getUTCDay()).toBe(1); // next Monday
    expect(due.getUTCDate()).toBe(21);
    const friday = new Date(Date.UTC(2026, 8, 18));
    expect(addBusinessDays(friday, 1).getUTCDay()).toBe(1);
  });
  it("labels reasons and payout methods, unknown codes pass through", () => {
    expect(reasonLabel("VISA_REFUSED")).toBe("Visa refusé");
    expect(reasonLabel("VISA_REFUSED", "en")).toBe("Visa refused");
    expect(payoutLabel("BANK_TRANSFER")).toBe("Virement bancaire");
    expect(reasonLabel("X")).toBe("X");
    expect(REASON_CODES.map((r) => r.code)).toContain("DUPLICATE_PAYMENT");
  });
  it("builds the public claim url", () => {
    expect(claimUrl("tok")).toBe("https://example.test/refund/tok");
  });
});
