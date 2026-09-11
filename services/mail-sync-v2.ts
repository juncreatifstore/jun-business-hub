"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitAsync } from "@/lib/rate-limit";
import {
  assertMailboxAccess,
  getAccessibleMailboxIds,
  recordMailReliabilityEvent,
} from "@/lib/mail-security";
import { syncFolder, backfillThreadRecipients } from "@/lib/google/gmail";
import { EMAIL_ALIAS_DOMAIN, EMAIL_ALIAS_DESTINATION } from "@/lib/email-aliases";
import { refreshGmailMailboxCache } from "@/lib/mail-gmail-cache";
import { warmMailConversationCache } from "@/lib/mail-thread-cache";

const INBOX_SYNC_LIMIT = 15;
const SECONDARY_SYNC_LIMIT = 5;
// Catch-up: when a pass fills its whole window with new threads (backlog after
// a reconnection or an outage), the unattended cron widens the inbox window in
// steps until a pass comes back with slack or the time budget is spent.
const CATCH_UP_STEPS = [60, 120, 250];
const CATCH_UP_BUDGET_MS = 75_000;
const CACHE_LIMIT = 40;
const BETWEEN_FOLDERS_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}
function isQuotaError(error: unknown) {
  const m = messageOf(error).toLowerCase();
  return (
    m.includes("ratelimitexceeded") ||
    m.includes("quota exceeded") ||
    m.includes("units per minute per user") ||
    m.includes("429") ||
    m.includes("403")
  );
}
function isReconnectError(error: unknown) {
  const m = messageOf(error).toLowerCase();
  return (
    m.includes("invalid_grant") || m.includes("expired or revoked") || m.includes("mailbox not connected")
  );
}

async function syncOne(accountId: string) {
  let created = 0;
  created += await syncFolder(accountId, "INBOX", INBOX_SYNC_LIMIT);
  await sleep(BETWEEN_FOLDERS_MS);
  // Secondary folders and the label/category cache are independent: run them together.
  const [sent, drafts, important] = await Promise.all([
    syncFolder(accountId, "SENT", SECONDARY_SYNC_LIMIT),
    syncFolder(accountId, "DRAFTS", SECONDARY_SYNC_LIMIT),
    syncFolder(accountId, "IMPORTANT", SECONDARY_SYNC_LIMIT),
    refreshGmailMailboxCache(accountId, CACHE_LIMIT),
  ]);
  created += sent + drafts + important;
  return {
    created,
    inboxLimit: INBOX_SYNC_LIMIT,
    secondaryLimit: SECONDARY_SYNC_LIMIT,
    cacheLimit: CACHE_LIMIT,
  };
}
function refresh() {
  revalidatePath("/app/mail");
  revalidatePath("/app/mail/intelligence");
  revalidatePath("/app/mail/operations");
  revalidatePath("/app/mail/security");
  revalidatePath("/app/settings/email");
}

export async function syncMailboxV2(accountId: string): Promise<void> {
  const user = await assertPermission("EMAIL_READ");
  try {
    await assertMailboxAccess(user, accountId);
  } catch {
    redirect("/app/mail?toast_error=Vous n’avez pas accès à cette boîte mail");
  }
  if (!(await rateLimitAsync(`gmail-sync-v2:${user.id}`, 2, 60_000)))
    redirect(
      `/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=Patientez environ 60 secondes avant de relancer la synchronisation Gmail`,
    );
  try {
    const result = await syncOne(accountId);
    await audit({
      userId: user.id,
      action: "GMAIL_SYNC",
      resourceType: "MailAccount",
      resourceId: accountId,
      after: { ...result, scope: "QUOTA_SAFE_RECENT" },
    });
    refresh();
    redirect(
      `/app/mail?mailbox=${encodeURIComponent(accountId)}&folder=INBOX&category=PRIMARY&toast=${encodeURIComponent("Synchronisation Gmail terminée")}`,
    );
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    const msg = messageOf(e);
    await recordMailReliabilityEvent({
      type: "SYNC_ERROR",
      accountId,
      userId: user.id,
      message: msg || "Gmail sync failed",
    });
    refresh();
    if (isReconnectError(e))
      redirect(
        `/app/settings/email?reconnect=${encodeURIComponent(accountId)}&toast_error=${encodeURIComponent("La session Gmail a expiré. Reconnectez ce compte Google.")}`,
      );
    if (isQuotaError(e))
      redirect(
        `/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=${encodeURIComponent("Google limite temporairement les requêtes Gmail. Patientez 60 secondes puis cliquez une seule fois sur Synchroniser.")}`,
      );
    redirect(
      `/app/mail?mailbox=${encodeURIComponent(accountId)}&toast_error=${encodeURIComponent(msg || "La synchronisation Gmail a échoué")}`,
    );
  }
}

export async function syncAllMailboxesV2(): Promise<void> {
  const user = await assertPermission("EMAIL_READ");
  if (!(await rateLimitAsync(`gmail-sync-all-v2:${user.id}`, 1, 60_000)))
    redirect(
      "/app/mail?mailbox=ALL&toast_error=Patientez environ 60 secondes avant de relancer la synchronisation Gmail",
    );
  const ids = await getAccessibleMailboxIds(user, true);
  const accounts = ids.length
    ? await prisma.mailAccount.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
    : [];
  if (!accounts.length) redirect("/app/mail?toast_error=Aucune boîte Gmail connectée accessible");
  let created = 0;
  const failures: string[] = [];
  let quotaFailure = false;
  let reconnectFailure = false;
  for (const account of accounts) {
    try {
      const r = await syncOne(account.id);
      created += r.created;
      await sleep(500);
    } catch (e) {
      const msg = messageOf(e);
      failures.push(account.email);
      quotaFailure = quotaFailure || isQuotaError(e);
      reconnectFailure = reconnectFailure || isReconnectError(e);
      await recordMailReliabilityEvent({
        type: "SYNC_ERROR",
        accountId: account.id,
        userId: user.id,
        message: msg || "Gmail sync failed",
      });
    }
  }
  await audit({
    userId: user.id,
    action: "GMAIL_SYNC_ALL",
    resourceType: "MailAccount",
    resourceId: null,
    after: {
      created,
      failures,
      inboxLimit: INBOX_SYNC_LIMIT,
      secondaryLimit: SECONDARY_SYNC_LIMIT,
      cacheLimit: CACHE_LIMIT,
      scope: "QUOTA_SAFE_RECENT",
    },
  });
  refresh();
  if (reconnectFailure)
    redirect(
      `/app/settings/email?toast_error=${encodeURIComponent("Une boîte Gmail doit être reconnectée avant la synchronisation.")}`,
    );
  if (quotaFailure)
    redirect(
      `/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast_error=${encodeURIComponent("Google limite temporairement les requêtes Gmail. Patientez 60 secondes puis relancez une seule fois.")}`,
    );
  if (failures.length)
    redirect(
      `/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast_error=${encodeURIComponent(`Synchronisation terminée avec erreur pour : ${failures.join(", ")}`)}`,
    );
  redirect(
    `/app/mail?mailbox=ALL&folder=INBOX&category=PRIMARY&toast=${encodeURIComponent("Toutes les boîtes Gmail ont été synchronisées")}`,
  );
}

/**
 * Unattended sync for the cron: no user, no redirect. Returns per-mailbox
 * results so the cron response is useful in the Vercel logs.
 */
export async function syncAllMailboxesUnattended() {
  const accounts = await prisma.mailAccount.findMany({
    where: { OR: [{ accessTokenEnc: { not: null } }, { refreshTokenEnc: { not: null } }] },
    select: { id: true, email: true },
  });
  const results: {
    email: string;
    ok: boolean;
    created?: number;
    caughtUp?: number;
    warmed?: number;
    backfilled?: number;
    error?: string;
  }[] = [];
  for (const acc of accounts) {
    try {
      const r = await syncOne(acc.id);
      let caughtUp = 0;
      if (r.created >= INBOX_SYNC_LIMIT) {
        const started = Date.now();
        for (const step of CATCH_UP_STEPS) {
          if (Date.now() - started > CATCH_UP_BUDGET_MS) break;
          await sleep(BETWEEN_FOLDERS_MS);
          const more = await syncFolder(acc.id, "INBOX", step);
          caughtUp += more;
          if (more < step / 4) break; // the window now has slack: backlog absorbed
        }
      }
      const w = await warmMailConversationCache(acc.id);
      // Only the alias destination mailbox receives alias traffic worth backfilling.
      const b =
        acc.email.toLowerCase() === EMAIL_ALIAS_DESTINATION
          ? await backfillThreadRecipients(acc.id, EMAIL_ALIAS_DOMAIN).catch(() => null)
          : null;
      results.push({
        email: acc.email,
        ok: true,
        created: r.created,
        warmed: w.warmed,
        backfilled: b?.updated,
      });
    } catch (e) {
      const msg = messageOf(e);
      await recordMailReliabilityEvent({ type: "SYNC_ERROR", accountId: acc.id, message: msg }).catch(
        () => {},
      );
      results.push({ email: acc.email, ok: false, error: msg });
    }
  }
  refresh();
  return results;
}
