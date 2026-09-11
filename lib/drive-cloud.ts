import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

export type CloudProvider = "google" | "microsoft";
export type CloudConnection = {
  provider: CloudProvider;
  userId: string;
  accountEmail: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  connectedAt: string;
  scopes: string[];
};

export type CloudFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
  isFolder: boolean;
  webUrl: string | null;
};

const PREFIX = "drive.cloud.connection.";

function keyMaterial() {
  const raw = process.env.CLOUD_CONNECTOR_SECRET || process.env.AUTH_SECRET;
  if (!raw) {
    if (process.env.NODE_ENV === "production")
      throw new Error("CLOUD_CONNECTOR_SECRET or AUTH_SECRET is required");
    return createHash("sha256").update("jun-cloud-dev-secret").digest();
  }
  return createHash("sha256").update(raw).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decrypt(value: string) {
  const [ivRaw, tagRaw, dataRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !dataRaw) throw new Error("Invalid encrypted cloud connection");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}

function connectionKey(userId: string, provider: CloudProvider) {
  return `${PREFIX}${userId}.${provider}`;
}

export function isCloudAdmin(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function saveCloudConnection(connection: CloudConnection) {
  const key = connectionKey(connection.userId, connection.provider);
  const value = encrypt(JSON.stringify(connection));
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

export async function getCloudConnection(
  userId: string,
  provider: CloudProvider,
): Promise<CloudConnection | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: connectionKey(userId, provider) },
    select: { value: true },
  });
  if (!row) return null;
  try {
    return JSON.parse(decrypt(row.value)) as CloudConnection;
  } catch {
    return null;
  }
}

export async function removeCloudConnection(userId: string, provider: CloudProvider) {
  await prisma.appSetting.deleteMany({ where: { key: connectionKey(userId, provider) } });
}

function oauthStateSecret() {
  const raw = process.env.CLOUD_CONNECTOR_SECRET || process.env.AUTH_SECRET || "jun-cloud-dev-secret";
  return new TextEncoder().encode(raw);
}

export async function signCloudOAuthState(userId: string, provider: CloudProvider) {
  return new SignJWT({ provider, scope: "drive-cloud-oauth" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(oauthStateSecret());
}

export async function verifyCloudOAuthState(state: string) {
  const { payload } = await jwtVerify(state, oauthStateSecret());
  if (
    payload.scope !== "drive-cloud-oauth" ||
    !payload.sub ||
    (payload.provider !== "google" && payload.provider !== "microsoft")
  )
    throw new Error("Invalid OAuth state");
  return { userId: payload.sub, provider: payload.provider as CloudProvider };
}

/** Callback URL registered with the provider; pinned to the public app URL when known. */
export function cloudRedirectUri(provider: CloudProvider, requestUrl?: string) {
  // Same origin as the Gmail callback already registered on the Google client,
  // then the public app URL, then the incoming request.
  let base = process.env.NEXT_PUBLIC_APP_URL || requestUrl || "";
  if (provider === "google" && process.env.GOOGLE_REDIRECT_URI) {
    try {
      base = new URL(process.env.GOOGLE_REDIRECT_URI).origin;
    } catch {
      /* keep fallback */
    }
  }
  return base ? new URL(`/api/drive/cloud/${provider}/callback`, base).toString() : "";
}

export function cloudOAuthConfig(provider: CloudProvider) {
  if (provider === "google") {
    // Dedicated Drive client if provided, otherwise the Workspace OAuth client
    // already used for Gmail (same Google Cloud project; the Drive callback
    // URI must be added to that client and the Drive API enabled).
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret };
  }
  const clientId = process.env.MICROSOFT_DRIVE_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function refreshCloudConnection(connection: CloudConnection): Promise<CloudConnection> {
  if (connection.expiresAt > Date.now() + 90_000) return connection;
  const config = cloudOAuthConfig(connection.provider);
  if (!config || !connection.refreshToken)
    throw new Error(`${connection.provider} cloud connection needs reauthorization`);

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
  });
  let endpoint = "https://oauth2.googleapis.com/token";
  if (connection.provider === "microsoft") {
    endpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    params.set("scope", "offline_access User.Read Files.ReadWrite");
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) throw new Error(`Unable to refresh ${connection.provider} connection`);
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  const next = {
    ...connection,
    accessToken: body.access_token,
    refreshToken: body.refresh_token || connection.refreshToken,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
  await saveCloudConnection(next);
  return next;
}

export type CloudCrumb = { id: string; name: string };

/** Breadcrumb from the root to `folderId` (root itself excluded). Google only for now. */
export async function cloudFolderPath(connection: CloudConnection, folderId: string): Promise<CloudCrumb[]> {
  const c = await refreshCloudConnection(connection);
  const crumbs: CloudCrumb[] = [];
  let current: string | undefined = folderId;
  for (let depth = 0; current && depth < 12; depth++) {
    if (c.provider === "google") {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(current)}?fields=id,name,parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${c.accessToken}` } },
      );
      if (!res.ok) break;
      const f = (await res.json()) as { id: string; name: string; parents?: string[] };
      crumbs.unshift({ id: f.id, name: f.name });
      current = f.parents?.[0];
      if (!current) break;
      // Stop at "My Drive" (its parent list is empty) — resolved on the next loop.
    } else {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(current)}`,
        {
          headers: { Authorization: `Bearer ${c.accessToken}` },
        },
      );
      if (!res.ok) break;
      const f = (await res.json()) as {
        id: string;
        name: string;
        parentReference?: { id?: string; path?: string };
      };
      if (f.name === "root" && !f.parentReference?.id) break;
      crumbs.unshift({ id: f.id, name: f.name });
      current = f.parentReference?.id;
    }
  }
  return crumbs;
}

/**
 * Lists a folder (folders first, then files). Without `folderId`, Google
 * returns the most recently modified items across the drive and OneDrive
 * returns the root.
 */
export type CloudListMode = "root" | "recent" | "search";

/**
 * Lists a location of the connected cloud. Default is the root of "My Drive"
 * (folders first, like the JUN browser); `recent` = most recently modified
 * across the drive; `search` = name contains `query`.
 */
export async function listCloudFiles(
  connection: CloudConnection,
  folderId?: string,
  options: { mode?: CloudListMode; query?: string } = {},
): Promise<CloudFile[]> {
  const c = await refreshCloudConnection(connection);
  const mode: CloudListMode = folderId ? "root" : options.query ? "search" : (options.mode ?? "root");
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  if (c.provider === "google") {
    const q = new URL("https://www.googleapis.com/drive/v3/files");
    q.searchParams.set("pageSize", "200");
    q.searchParams.set("orderBy", mode === "recent" ? "modifiedTime desc" : "folder,name");
    q.searchParams.set(
      "q",
      folderId
        ? `'${esc(folderId)}' in parents and trashed = false`
        : mode === "search"
          ? `name contains '${esc(options.query ?? "")}' and trashed = false`
          : mode === "recent"
            ? "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
            : "'root' in parents and trashed = false",
    );
    q.searchParams.set("fields", "files(id,name,mimeType,size,modifiedTime,webViewLink)");
    q.searchParams.set("supportsAllDrives", "true");
    q.searchParams.set("includeItemsFromAllDrives", "true");
    const res = await fetch(q, { headers: { Authorization: `Bearer ${c.accessToken}` } });
    if (!res.ok) throw new Error("Unable to list Google Drive files");
    const body = (await res.json()) as {
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
        webViewLink?: string;
      }>;
    };
    return (body.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      sizeBytes: f.size ? Number(f.size) : null,
      modifiedAt: f.modifiedTime || null,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      webUrl: f.webViewLink || null,
    }));
  }

  const res = await fetch(
    folderId
      ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children?$top=200&$orderby=name`
      : mode === "search"
        ? `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(esc(options.query ?? ""))}')?$top=100`
        : mode === "recent"
          ? "https://graph.microsoft.com/v1.0/me/drive/recent?$top=100"
          : "https://graph.microsoft.com/v1.0/me/drive/root/children?$top=200&$orderby=name",
    { headers: { Authorization: `Bearer ${c.accessToken}` } },
  );
  if (!res.ok) throw new Error("Unable to list OneDrive files");
  const body = (await res.json()) as {
    value?: Array<{
      id: string;
      name: string;
      size?: number;
      lastModifiedDateTime?: string;
      webUrl?: string;
      folder?: unknown;
      file?: { mimeType?: string };
    }>;
  };
  return (body.value || []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.folder ? "application/vnd.microsoft.folder" : f.file?.mimeType || "application/octet-stream",
    sizeBytes: typeof f.size === "number" ? f.size : null,
    modifiedAt: f.lastModifiedDateTime || null,
    isFolder: Boolean(f.folder),
    webUrl: f.webUrl || null,
  }));
}

function nativeGoogleExport(mimeType: string, name: string) {
  const map: Record<string, { mime: string; ext: string }> = {
    "application/vnd.google-apps.document": {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: ".docx",
    },
    "application/vnd.google-apps.spreadsheet": {
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ext: ".xlsx",
    },
    "application/vnd.google-apps.presentation": {
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ext: ".pptx",
    },
    "application/vnd.google-apps.drawing": { mime: "application/pdf", ext: ".pdf" },
  };
  const target = map[mimeType];
  if (!target) return null;
  const cleanName = name.replace(/\.(gdoc|gsheet|gslides)$/i, "");
  return {
    ...target,
    name: cleanName.toLowerCase().endsWith(target.ext) ? cleanName : `${cleanName}${target.ext}`,
  };
}

export async function downloadCloudFile(
  connection: CloudConnection,
  fileId: string,
  options: { forPreview?: boolean } = {},
): Promise<{ data: Buffer; name: string; mimeType: string }> {
  const c = await refreshCloudConnection(connection);
  if (c.provider === "google") {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${c.accessToken}` } },
    );
    if (!metaRes.ok) throw new Error("Google Drive file not found");
    const meta = (await metaRes.json()) as { name: string; mimeType: string };
    // In-app preview: Docs/Sheets/Slides render best as PDF in the browser.
    const native =
      options.forPreview && meta.mimeType.startsWith("application/vnd.google-apps.")
        ? {
            mime: "application/pdf",
            ext: ".pdf",
            name: `${meta.name.replace(/\.(gdoc|gsheet|gslides)$/i, "")}.pdf`,
          }
        : nativeGoogleExport(meta.mimeType, meta.name);
    if (native) {
      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(native.mime)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${c.accessToken}` } });
      if (!res.ok) throw new Error("Unable to export native Google file");
      return { data: Buffer.from(await res.arrayBuffer()), name: native.name, mimeType: native.mime };
    }
    if (meta.mimeType.startsWith("application/vnd.google-apps."))
      throw new Error("This Google-native file type cannot be exported to a standard JUN Drive format yet");
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${c.accessToken}` } },
    );
    if (!res.ok) throw new Error("Unable to download Google Drive file");
    return {
      data: Buffer.from(await res.arrayBuffer()),
      name: meta.name,
      mimeType: meta.mimeType || res.headers.get("content-type") || "application/octet-stream",
    };
  }

  const metaRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`,
    { headers: { Authorization: `Bearer ${c.accessToken}` } },
  );
  if (!metaRes.ok) throw new Error("OneDrive file not found");
  const meta = (await metaRes.json()) as { name: string; file?: { mimeType?: string }; folder?: unknown };
  if (meta.folder) throw new Error("Folder import is not supported from this screen yet");
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
    { headers: { Authorization: `Bearer ${c.accessToken}` }, redirect: "follow" },
  );
  if (!res.ok) throw new Error("Unable to download OneDrive file");
  return {
    data: Buffer.from(await res.arrayBuffer()),
    name: meta.name,
    mimeType: meta.file?.mimeType || res.headers.get("content-type") || "application/octet-stream",
  };
}

export type CloudFileDetails = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string | null;
  modifiedAt: string | null;
  owner: string | null;
  lastModifiedBy: string | null;
  webUrl: string | null;
  shared: boolean | null;
  parentId: string | null;
};

/** Full metadata for one file, for the in-app viewer. */
export async function getCloudFileDetails(
  connection: CloudConnection,
  fileId: string,
): Promise<CloudFileDetails | null> {
  const c = await refreshCloudConnection(connection);
  if (c.provider === "google") {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,shared,parents,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress)&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${c.accessToken}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const m = (await res.json()) as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      createdTime?: string;
      modifiedTime?: string;
      webViewLink?: string;
      shared?: boolean;
      parents?: string[];
      owners?: Array<{ displayName?: string; emailAddress?: string }>;
      lastModifyingUser?: { displayName?: string; emailAddress?: string };
    };
    const who = (u?: { displayName?: string; emailAddress?: string }) =>
      u ? [u.displayName, u.emailAddress].filter(Boolean).join(" · ") || null : null;
    return {
      id: m.id,
      name: m.name,
      mimeType: m.mimeType,
      sizeBytes: m.size ? Number(m.size) : null,
      createdAt: m.createdTime ?? null,
      modifiedAt: m.modifiedTime ?? null,
      owner: who(m.owners?.[0]),
      lastModifiedBy: who(m.lastModifyingUser),
      webUrl: m.webViewLink ?? null,
      shared: m.shared ?? null,
      parentId: m.parents?.[0] ?? null,
    };
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${c.accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const m = (await res.json()) as {
    id: string;
    name: string;
    size?: number;
    createdDateTime?: string;
    lastModifiedDateTime?: string;
    webUrl?: string;
    file?: { mimeType?: string };
    parentReference?: { id?: string };
    createdBy?: { user?: { displayName?: string; email?: string } };
    lastModifiedBy?: { user?: { displayName?: string; email?: string } };
    shared?: unknown;
  };
  const who = (u?: { displayName?: string; email?: string }) =>
    u ? [u.displayName, u.email].filter(Boolean).join(" · ") || null : null;
  return {
    id: m.id,
    name: m.name,
    mimeType: m.file?.mimeType ?? "application/octet-stream",
    sizeBytes: typeof m.size === "number" ? m.size : null,
    createdAt: m.createdDateTime ?? null,
    modifiedAt: m.lastModifiedDateTime ?? null,
    owner: who(m.createdBy?.user),
    lastModifiedBy: who(m.lastModifiedBy?.user),
    webUrl: m.webUrl ?? null,
    shared: m.shared ? true : null,
    parentId: m.parentReference?.id ?? null,
  };
}

/** Uploads bytes into the connected cloud (Google: multipart; OneDrive: simple PUT ≤ 4 MB, else upload session). */
export async function uploadCloudFile(
  connection: CloudConnection,
  input: { name: string; mimeType: string; data: Buffer; folderId?: string | null },
): Promise<{ id: string; webUrl: string | null }> {
  const c = await refreshCloudConnection(connection);
  if (c.provider === "google") {
    const boundary = `jun-${Date.now().toString(36)}`;
    const meta = JSON.stringify({
      name: input.name,
      ...(input.folderId ? { parents: [input.folderId] } : {}),
    });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      input.data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: new Uint8Array(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        res.status === 403
          ? "Google Drive refused the upload — disconnect and reconnect Google Drive to grant write access."
          : `Google Drive upload failed (${res.status}) ${text.slice(0, 200)}`,
      );
    }
    const out = (await res.json()) as { id: string; webViewLink?: string };
    return { id: out.id, webUrl: out.webViewLink ?? null };
  }
  const target = input.folderId
    ? `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(input.folderId)}:/${encodeURIComponent(input.name)}:/content`
    : `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(input.name)}:/content`;
  if (input.data.byteLength > 4 * 1024 * 1024)
    throw new Error("OneDrive: files over 4 MB are not supported from this screen yet");
  const res = await fetch(target, {
    method: "PUT",
    headers: { Authorization: `Bearer ${c.accessToken}`, "Content-Type": input.mimeType },
    body: new Uint8Array(input.data),
  });
  if (!res.ok) throw new Error(`OneDrive upload failed (${res.status})`);
  const out = (await res.json()) as { id: string; webUrl?: string };
  return { id: out.id, webUrl: out.webUrl ?? null };
}
