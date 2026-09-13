import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppText: vi.fn() }));
vi.mock("@/lib/whatsapp-inbox", () => ({ recordOutgoingWhatsAppMessage: vi.fn() }));
vi.mock("@/lib/document-requirements", () => ({ caseChecklist: vi.fn() }));
vi.mock("@/lib/document-requests", () => ({ appBaseUrl: () => "https://x" }));
import { isWithinHours, DEFAULT_AUTOREPLY } from "@/lib/whatsapp-autoreply";

describe("whatsapp auto-reply hours", () => {
  it("detects open/closed in the configured timezone", () => {
    const s = { ...DEFAULT_AUTOREPLY, timezone: "UTC" };
    // Wednesday 2026-09-16 10:00 UTC → open; 20:00 → closed; Sunday → closed
    expect(isWithinHours(s, new Date("2026-09-16T10:00:00Z"))).toBe(true);
    expect(isWithinHours(s, new Date("2026-09-16T20:00:00Z"))).toBe(false);
    expect(isWithinHours(s, new Date("2026-09-13T10:00:00Z"))).toBe(false);
    // Saturday 12:00 open (09–13), 14:00 closed
    expect(isWithinHours(s, new Date("2026-09-19T12:00:00Z"))).toBe(true);
    expect(isWithinHours(s, new Date("2026-09-19T14:00:00Z"))).toBe(false);
  });
});
