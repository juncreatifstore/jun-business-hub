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
