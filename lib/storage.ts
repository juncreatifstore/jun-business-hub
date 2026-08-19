import "server-only";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

// Storage abstraction: SUPABASE in production, LOCAL for development.
// Files are private by default. Access always goes through short-lived signed URLs
// (Supabase) or an authenticated download route (local). Never build permanent public URLs.
// The interface is intentionally provider-agnostic so a Google Drive adapter can be
// added later without touching feature code.

export interface StorageDriver {
  upload(key: string, data: Buffer, contentType: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  download(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const BUCKET = "jun-files";

class SupabaseStorage implements StorageDriver {
  private client() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only, never sent to the client
    if (!url || !key) throw new Error("Supabase storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    return createClient(url, key, { auth: { persistSession: false } });
  }
  async upload(key: string, data: Buffer, contentType: string) {
    const { error } = await this.client().storage.from(BUCKET).upload(key, data, { contentType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }
  async getSignedUrl(key: string, expiresInSeconds = 300) {
    const { data, error } = await this.client().storage.from(BUCKET).createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`);
    return data.signedUrl;
  }
  async download(key: string) {
    const { data, error } = await this.client().storage.from(BUCKET).download(key);
    if (error || !data) throw new Error(`Download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(key: string) {
    await this.client().storage.from(BUCKET).remove([key]);
  }
}

// Dev-only driver. Writes under ./storage-dev (gitignored). Served through /api/files/[id],
// which enforces authentication + permissions.
class LocalStorage implements StorageDriver {
  private dir = path.join(process.cwd(), "storage-dev");
  private p(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    return path.join(this.dir, safe);
  }
  async upload(key: string, data: Buffer) {
    const fp = this.p(key);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, data);
  }
  async getSignedUrl(): Promise<string> {
    // Local driver has no CDN: files are always served through the authenticated
    // route /api/files/[id]. This URL is never used directly.
    throw new Error("LocalStorage has no signed URLs — serve files via /api/files/[id]");
  }
  async download(key: string) {
    return fs.readFile(this.p(key));
  }
  async remove(key: string) {
    await fs.rm(this.p(key), { force: true });
  }
}

export function storage(): StorageDriver {
  return process.env.STORAGE_DRIVER === "SUPABASE" ? new SupabaseStorage() : new LocalStorage();
}

export function makeStorageKey(scope: string, filename: string) {
  const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
  return `${scope}/${new Date().getFullYear()}/${randomUUID()}.${ext}`;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const ALLOWED_MIME = [
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
