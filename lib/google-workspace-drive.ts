import "server-only";

import { importPKCS8, SignJWT } from "jose";

export type WorkspaceDriveItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: string | null;
  parentId: string | null;
  isFolder: boolean;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function cfg() {
  const serviceAccountEmail = process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_WORKSPACE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const impersonateUser = process.env.GOOGLE_WORKSPACE_IMPERSONATE_USER;
  const rootFolderId = process.env.GOOGLE_WORKSPACE_ROOT_FOLDER_ID;
  if (!serviceAccountEmail || !privateKey || !impersonateUser || !rootFolderId) {
    throw new Error("Google Workspace storage requires GOOGLE_WORKSPACE_SERVICE_ACCOUNT_EMAIL, GOOGLE_WORKSPACE_PRIVATE_KEY, GOOGLE_WORKSPACE_IMPERSONATE_USER and GOOGLE_WORKSPACE_ROOT_FOLDER_ID");
  }
  return { serviceAccountEmail, privateKey, impersonateUser, rootFolderId };
}

export function googleWorkspaceConfigured() {
  try { cfg(); return true; } catch { return false; }
}

export function googleWorkspaceRootFolderId() {
  return cfg().rootFolderId;
}

export async function googleWorkspaceAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const c = cfg();
  const key = await importPKCS8(c.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/drive", sub: c.impersonateUser })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(c.serviceAccountEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`Google Workspace token request failed (${res.status})`);
  const json = await res.json() as { access_token: string; expires_in?: number };
  cachedToken = { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000 };
  return json.access_token;
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listByParent(parentId: string, name?: string) {
  const token = await googleWorkspaceAccessToken();
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  const clauses = [`'${escapeQuery(parentId)}' in parents`, "trashed = false"];
  if (name) clauses.push(`name = '${escapeQuery(name)}'`);
  url.searchParams.set("q", clauses.join(" and "));
  url.searchParams.set("pageSize", "1000");
  url.searchParams.set("fields", "files(id,name,mimeType,size,modifiedTime,parents)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Workspace list failed (${res.status})`);
  const json = await res.json() as { files?: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; parents?: string[] }> };
  return (json.files || []).map((f): WorkspaceDriveItem => ({ id: f.id, name: f.name, mimeType: f.mimeType, sizeBytes: Number(f.size || 0), modifiedAt: f.modifiedTime || null, parentId: f.parents?.[0] || parentId, isFolder: f.mimeType === "application/vnd.google-apps.folder" }));
}

export async function listWorkspaceChildren(parentId: string) {
  return listByParent(parentId);
}

export async function ensureWorkspaceFolder(parentId: string, name: string) {
  const existing = (await listByParent(parentId, name)).find((f) => f.isFolder);
  if (existing) return existing.id;
  const token = await googleWorkspaceAccessToken();
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`Google Workspace folder create failed (${res.status})`);
  return (await res.json() as { id: string }).id;
}

export async function resolveWorkspacePath(pathKey: string, createFolders = false) {
  const parts = pathKey.split("/").filter(Boolean);
  if (!parts.length) throw new Error("Invalid workspace storage key");
  let parentId = googleWorkspaceRootFolderId();
  for (const segment of parts.slice(0, -1)) {
    const folder = (await listByParent(parentId, segment)).find((f) => f.isFolder);
    if (folder) parentId = folder.id;
    else if (createFolders) parentId = await ensureWorkspaceFolder(parentId, segment);
    else return null;
  }
  const fileName = parts[parts.length - 1];
  const file = (await listByParent(parentId, fileName)).find((f) => !f.isFolder);
  return { parentId, fileName, file: file || null };
}

export async function uploadWorkspaceFile(pathKey: string, data: Buffer, contentType: string) {
  const resolved = await resolveWorkspacePath(pathKey, true);
  if (!resolved) throw new Error("Unable to resolve Workspace path");
  const token = await googleWorkspaceAccessToken();
  const boundary = `jun_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: resolved.fileName, parents: [resolved.parentId], appProperties: { junStorageKey: pathKey } });
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, data, tail]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw new Error(`Google Workspace upload failed (${res.status})`);
}

export async function createWorkspaceResumableUploadSession(pathKey: string, contentType: string, sizeBytes: number) {
  const resolved = await resolveWorkspacePath(pathKey, true);
  if (!resolved) throw new Error("Unable to resolve Workspace path");
  const token = await googleWorkspaceAccessToken();
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": contentType,
      "X-Upload-Content-Length": String(sizeBytes),
    },
    body: JSON.stringify({ name: resolved.fileName, parents: [resolved.parentId], appProperties: { junStorageKey: pathKey } }),
  });
  if (!res.ok) throw new Error(`Google Workspace resumable session failed (${res.status})`);
  const uploadUrl = res.headers.get("location");
  if (!uploadUrl) throw new Error("Google Workspace did not return a resumable upload URL");
  return uploadUrl;
}

export async function downloadWorkspaceFile(pathKey: string) {
  const resolved = await resolveWorkspacePath(pathKey, false);
  if (!resolved?.file) throw new Error("Workspace file not found");
  const token = await googleWorkspaceAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resolved.file.id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Workspace download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeWorkspaceFile(pathKey: string) {
  const resolved = await resolveWorkspacePath(pathKey, false);
  if (!resolved?.file) return;
  const token = await googleWorkspaceAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resolved.file.id)}?supportsAllDrives=true`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Google Workspace delete failed (${res.status})`);
}

export async function walkWorkspaceTree() {
  const out: Array<WorkspaceDriveItem & { relativePath: string }> = [];
  const queue: Array<{ id: string; path: string }> = [{ id: googleWorkspaceRootFolderId(), path: "" }];
  let scanned = 0;
  while (queue.length && scanned < 5000) {
    const current = queue.shift()!;
    const children = await listWorkspaceChildren(current.id);
    for (const item of children) {
      scanned++;
      const relativePath = current.path ? `${current.path}/${item.name}` : item.name;
      out.push({ ...item, relativePath });
      if (item.isFolder && scanned < 5000) queue.push({ id: item.id, path: relativePath });
    }
  }
  return out;
}
