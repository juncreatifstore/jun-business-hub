import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, can } from "@/lib/auth";
import { getAccessibleMailboxIds } from "@/lib/mail-security";
import { getMailComposeMeta } from "@/lib/mail-compose-meta";
import { GmailStyleMailCenterV6 } from "@/components/mail/gmail-style-mail-center";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function MailPage(props: {
  searchParams: Promise<{
    folder?: string;
    thread?: string;
    compose?: string;
    q?: string;
    mailbox?: string;
    source?: string;
    mode?: string;
    category?: string;
    alias?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!can(user, "EMAIL_READ")) redirect("/app/forbidden");
  const accessibleIds = await getAccessibleMailboxIds(user, true);
  if (searchParams.compose === "1") {
    const p = new URLSearchParams();
    if (searchParams.mailbox && accessibleIds.includes(searchParams.mailbox))
      p.set("mailbox", searchParams.mailbox);
    if (searchParams.source) p.set("source", searchParams.source);
    if (searchParams.mode) p.set("mode", searchParams.mode);
    redirect(`/app/mail/compose?${p.toString()}`);
  }
  if (searchParams.folder === "DRAFTS" && searchParams.thread) {
    const meta = await getMailComposeMeta(searchParams.thread);
    if (meta) {
      const t = await prisma.mailThread.findFirst({
        where: { id: searchParams.thread, mailAccountId: { in: accessibleIds } },
        select: { mailAccountId: true, aiDraft: true },
      });
      if (t?.aiDraft)
        redirect(
          `/app/mail/compose?mailbox=${encodeURIComponent(t.mailAccountId)}&draft=${searchParams.thread}`,
        );
    }
  }
  const active =
    searchParams.thread && accessibleIds.length
      ? await prisma.mailThread.findFirst({
          where: { id: searchParams.thread, mailAccountId: { in: accessibleIds } },
          select: { mailAccountId: true },
        })
      : null;
  const mailbox =
    active?.mailAccountId ||
    (searchParams.mailbox && accessibleIds.includes(searchParams.mailbox) ? searchParams.mailbox : "ALL");
  return (
    <div className="space-y-3">
      <GmailStyleMailCenterV6 searchParams={{ ...searchParams, mailbox }} />
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-3">Outils</span>
        <Link prefetch={false} href="/app/mail/aliases">
          <Button size="sm" variant="ghost">
            Centre des alias
          </Button>
        </Link>
        <Link prefetch={false} href="/app/mail/search">
          <Button size="sm" variant="ghost">
            Recherche avancée
          </Button>
        </Link>
        <Link prefetch={false} href="/app/mail/analytics">
          <Button size="sm" variant="ghost">
            Statistiques
          </Button>
        </Link>
        <Link prefetch={false} href="/app/mail/operations">
          <Button size="sm" variant="ghost">
            Opérations et SLA
          </Button>
        </Link>
        <Link prefetch={false} href="/app/mail/intelligence">
          <Button size="sm" variant="ghost">
            Intelligence
          </Button>
        </Link>
        <Link prefetch={false} href="/app/mail/approvals">
          <Button size="sm" variant="ghost">
            Validations IA
          </Button>
        </Link>
        {can(user, "EMAIL_MANAGE") ? (
          <Link prefetch={false} href="/app/mail/security">
            <Button size="sm" variant="ghost">
              Sécurité
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
