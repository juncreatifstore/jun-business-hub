import { createHash } from "crypto";

// SHA-256 hex digest used for document integrity (versions + final documents).
export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}
