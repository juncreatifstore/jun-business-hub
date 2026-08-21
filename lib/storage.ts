import "server-only";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { downloadWorkspaceFile, removeWorkspaceFile, uploadWorkspaceFile } from "@/lib/google-workspace-drive";

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
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    if (error || !data) throw new Error(`Download failed: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(key: string) {
    await this.client().storage.from(BUCKET).remove([key]);
  }
}

class GoogleWorkspaceStorage implements StorageDriver {
  async upload(key: string, data: Buffer, contentType: string) {
    await uploadWorkspaceFile(key, data, contentType);
  }
  async getSignedUrl(): Promise<string> {
    throw new Error("Google Workspace storage is private and served through JUN authenticated/public policy routes");
  }
  async download(key: string) {
    return downloadWorkspaceFile(key);
  }
  async remove(key: string) {
    await removeWorkspaceFile(key);
  }
}

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
  const configured = (process.env.STORAGE_DRIVER ?? "").toUpperCase();
  if (process.env.NODE_ENV === "production") {
    if (configured === "GOOGLE_WORKSPACE") return new GoogleWorkspaceStorage();
    if (configured && configured !== "SUPABASE") throw new Error(`Unsupported production STORAGE_DRIVER: ${configured}`);
    return new SupabaseStorage();
  }
  if (configured === "GOOGLE_WORKSPACE") return new GoogleWorkspaceStorage();
  return configured === "SUPABASE" ? new SupabaseStorage() : new LocalStorage();
}

function safeFileName(filename: string) {
  const compact = filename.trim().replace(/\s+/g, " ").replace(/[\\/:*?"<>|]/g, "_").slice(-140);
  return compact || "file.bin";
}

export function makeStorageKey(scope: string, filename: string) {
  return `${scope}/${new Date().getFullYear()}/${randomUUID()}-${safeFileName(filename)}`;
}

// Direct browser uploads stay deliberately small on the current server-action path.
// Larger media should enter through Connected Cloud / direct-to-storage sync.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_MIME = [
  "application/pdf",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif",
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg", "audio/webm", "audio/aac", "audio/flac",
  "video/mp4", "video/webm", "video/quicktime", "video/x-m4v", "video/mpeg", "video/ogg",
  "text/plain", "text/csv", "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
