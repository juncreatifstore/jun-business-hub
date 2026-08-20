import { describe, expect, it } from "vitest";
import { signatureRecipients, signatureRecipientsPayload, signatureRequestMeta } from "../lib/signature-recipients";

describe("signature recipient security metadata", () => {
  it("round-trips OTP, link, session and retention metadata", () => {
    const recipients = [{
      name: "Jane Signer",
      email: "jane@example.com",
      order: 1,
      role: "CLIENT",
      linkVersion: 3,
      signingSessionId: "session-abc",
      otpAttempts: 2,
      otpSendCount: 3,
      otpWindowStartedAt: "2026-08-20T08:00:00.000Z",
      otpLockedUntil: "2026-08-20T08:15:00.000Z",
      verifiedAt: "2026-08-20T08:05:00.000Z",
      signatureMethod: "DRAW" as const,
      signatureImageHash: "a".repeat(64),
      fields: [{ type: "SIGNATURE" as const, page: 1, x: 72, y: 610, width: 150, height: 48 }],
    }];
    const payload = signatureRecipientsPayload(recipients, {
      message: "Please sign",
      expiresAt: "2026-09-03T08:00:00.000Z",
      retentionUntil: "2033-08-20T08:00:00.000Z",
    });

    const parsed = signatureRecipients(payload);
    const meta = signatureRequestMeta(payload);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      email: "jane@example.com",
      linkVersion: 3,
      signingSessionId: "session-abc",
      otpAttempts: 2,
      otpSendCount: 3,
      signatureMethod: "DRAW",
    });
    expect(parsed[0].fields?.[0]).toMatchObject({ type: "SIGNATURE", page: 1, width: 150, height: 48 });
    expect(meta.retentionUntil).toBe("2033-08-20T08:00:00.000Z");
  });

  it("normalizes unsafe or malformed field dimensions", () => {
    const parsed = signatureRecipients([{ name: "A", email: "a@b.co", order: 1, fields: [
      { type: "SIGNATURE", page: 0, x: -20, y: -10, width: 1, height: 1 },
      { type: "UNKNOWN", page: 1, x: 0, y: 0 },
    ] }]);
    expect(parsed[0].fields).toHaveLength(1);
    expect(parsed[0].fields?.[0]).toMatchObject({ page: 1, x: 0, y: 0, width: 24, height: 18 });
  });

  it("defaults old requests to link version 1", () => {
    const parsed = signatureRecipients([{ name: "Legacy", email: "legacy@example.com", order: 1 }]);
    expect(parsed[0].linkVersion).toBe(1);
    expect(parsed[0].otpSendCount).toBe(0);
  });
});
