import "server-only";

import { accessTokenFor } from "@/lib/google/gmail";

export type GoogleSendAsAlias = {
  sendAsEmail: string;
  displayName?: string;
  isPrimary?: boolean;
  isDefault?: boolean;
  verificationStatus?: "accepted" | "pending" | "verificationStatusUnspecified";
};

export async function listGoogleSendAsAliases(accountId: string): Promise<GoogleSendAsAlias[]> {
  const { token } = await accessTokenFor(accountId);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google SendAs sync failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { sendAs?: GoogleSendAsAlias[] };
  return Array.isArray(data.sendAs) ? data.sendAs : [];
}

export async function listGoogleDirectoryAliases(accountId: string, userEmail: string): Promise<string[]> {
  const { token } = await accessTokenFor(accountId);
  const url =
    "https://admin.googleapis.com/admin/directory/v1/users/" + encodeURIComponent(userEmail) + "/aliases";
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Autorisation Google Admin manquante. Activez Admin SDK API puis reconnectez admin@juncreatifs.org.",
      );
    }
    throw new Error(`Google Directory alias sync failed: ${response.status} ${detail}`);
  }
  const data = (await response.json()) as { aliases?: Array<{ alias?: string }> };
  return (data.aliases ?? [])
    .map((entry) =>
      String(entry.alias || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}
