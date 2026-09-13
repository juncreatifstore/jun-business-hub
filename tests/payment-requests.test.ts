import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mail-otp-sender", () => ({ resolveOtpSenderMailbox: vi.fn() }));
vi.mock("@/lib/google/gmail", () => ({ gmailSend: vi.fn() }));
vi.mock("@/lib/whatsapp-outreach", () => ({ sendWhatsAppLink: vi.fn() }));
vi.mock("@/lib/sequence", () => ({ nextNumber: vi.fn(async () => "PAY-1") }));
vi.mock("@/lib/document-requests", () => ({ appBaseUrl: () => "https://example.test" }));
import { PAY_METHODS, payMethodLabel, paymentRequestUrl } from "@/lib/payment-requests";

describe("payment requests", () => {
  it("maps every client-facing method to a hub PaymentMethod", () => {
    const hub = new Set([
      "ZELLE",
      "STRIPE",
      "PAYPAL",
      "MERCADO_PAGO",
      "BANK_TRANSFER",
      "CASH",
      "MONCASH",
      "OTHER",
    ]);
    for (const m of PAY_METHODS) expect(hub.has(m.hub)).toBe(true);
    expect(PAY_METHODS.find((m) => m.code === "WESTERN_UNION")?.hub).toBe("OTHER");
  });
  it("labels and urls", () => {
    expect(payMethodLabel("MONCASH")).toMatch(/MonCash/);
    expect(payMethodLabel("ZELLE", "en")).toBe("Zelle");
    expect(paymentRequestUrl("t")).toBe("https://example.test/p/t");
  });
});
