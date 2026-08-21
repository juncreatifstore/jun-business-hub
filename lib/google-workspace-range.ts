import "server-only";

import { googleWorkspaceAccessToken, resolveWorkspacePath } from "@/lib/google-workspace-drive";

export async function downloadWorkspaceRange(pathKey: string, start: number, end: number) {
  const resolved = await resolveWorkspacePath(pathKey, false);
  if (!resolved?.file) throw new Error("Workspace file not found");
  const token = await googleWorkspaceAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resolved.file.id)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}`, Range: `bytes=${start}-${end}` },
  });
  if (!res.ok && res.status !== 206) throw new Error(`Google Workspace range download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
