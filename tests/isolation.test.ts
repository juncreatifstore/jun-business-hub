import { describe, it, expect, beforeAll } from "vitest";
import { clientCanAccessFile, clientCanAccessDocument, clientCanAccessReceipt, isDocumentFrozen } from "@/lib/portal";

const A = "client_A";
const B = "client_B";

describe("client portal isolation (IDOR predicates used by the API routes)", () => {
  it("client A can read their own non-vault file; never B's, never vault", () => {
    expect(clientCanAccessFile({ clientId: A, isVault: false }, A)).toBe(true);
    expect(clientCanAccessFile({ clientId: B, isVault: false }, A)).toBe(false);
    expect(clientCanAccessFile({ clientId: A, isVault: true }, A)).toBe(false); // Vault always blocked for portal
    expect(clientCanAccessFile({ clientId: null, isVault: false }, A)).toBe(false); // unlinked company file
  });

  it("client A can read only their own FINAL/SIGNED documents", () => {
    expect(clientCanAccessDocument({ clientId: A, status: "FINAL" }, A)).toBe(true);
    expect(clientCanAccessDocument({ clientId: A, status: "SIGNED" }, A)).toBe(true);
    expect(clientCanAccessDocument({ clientId: A, status: "DRAFT" }, A)).toBe(false); // drafts stay internal
    expect(clientCanAccessDocument({ clientId: B, status: "FINAL" }, A)).toBe(false); // cross-client → 403
    expect(clientCanAccessDocument({ clientId: null, status: "FINAL" }, A)).toBe(false);
  });

  it("client A can read only their own receipts", () => {
    expect(clientCanAccessReceipt({ clientId: A }, A)).toBe(true);
    expect(clientCanAccessReceipt({ clientId: B }, A)).toBe(false);
  });
});

describe("document versioning — frozen statuses", () => {
  it("SIGNED and VOIDED documents can never be edited", () => {
    expect(isDocumentFrozen("SIGNED")).toBe(true);
    expect(isDocumentFrozen("VOIDED")).toBe(true);
  });
  it("DRAFT and FINAL accept new versions (FINAL resets to DRAFT on save)", () => {
    expect(isDocumentFrozen("DRAFT")).toBe(false);
    expect(isDocumentFrozen("FINAL")).toBe(false);
    expect(isDocumentFrozen("ARCHIVED")).toBe(false);
  });
});

describe("MFA helpers (TOTP + recovery codes)", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = "test-secret-for-unit-tests-0123456789";
  });

  it("TOTP: generated code verifies; wrong code fails", async () => {
    const { generateSecret, generate, verify } = await import("otplib");
    const secret = generateSecret();
    const code = await generate({ secret });
    expect((await verify({ secret, token: code, epochTolerance: 1 })).valid).toBe(true);
    expect((await verify({ secret, token: "000000", epochTolerance: 1 })).valid).toBe(false);
  });

  it("MFA secret encrypt/decrypt roundtrips with the app crypto", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const { generateSecret } = await import("otplib");
    const secret = generateSecret();
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("recovery codes: sha256 lookup matches only the exact code (single-use model)", async () => {
    const { sha256 } = await import("@/lib/hash");
    const codes = ["a1b2c3d4e5", "ffeeddccbb"];
    const stored = codes.map((c) => sha256(c));
    expect(stored.includes(sha256("a1b2c3d4e5"))).toBe(true);
    expect(stored.includes(sha256("A1B2C3D4E5".toLowerCase()))).toBe(true); // login lowercases input
    expect(stored.includes(sha256("wrongcode1"))).toBe(false);
  });
});
