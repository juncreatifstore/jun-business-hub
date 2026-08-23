import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { googleConfigured } from "@/lib/google/gmail";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { disconnectMailbox } from "@/services/mailbox";
import { updateMailboxProfile } from "@/services/mailbox-profile";
import { formatDateTime } from "@/lib/utils";
import { Mail, Plug } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");

  const accounts = await prisma.mailAccount.findMany({ orderBy: { createdAt: "asc" } });
  const configured = googleConfigured();

  return (
    <div>
      <PageHeader title="Email integration" subtitle="Connect and manage Google Workspace mailboxes used by JUN Mail Center." actions={<Link href="/app/mail?mailbox=ALL"><Button variant="outline">Open Mail Center</Button></Link>} />

      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Connect a Gmail / Google Workspace mailbox</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {configured ? (
            <>
              <p className="text-sm text-muted2">Connect as many operational mailboxes as needed. Each connected address can be selected independently inside JUN Mail Center or viewed through All Inboxes.</p>
              <a href="/api/google/oauth/start"><Button variant="primary">Connect another Gmail</Button></a>
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium text-amber-300">READY — CREDENTIALS REQUIRED</p>
              <p className="mt-1 text-muted2">Set these environment variables to activate Google OAuth:</p>
              <pre className="registry-id mt-2 text-xs text-white/70">GOOGLE_CLIENT_ID{"\n"}GOOGLE_CLIENT_SECRET{"\n"}GOOGLE_REDIRECT_URI = https://www.juncreatif.org/api/google/oauth/callback</pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Connected mailboxes</CardTitle></CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-sm text-muted2">No mailbox connected yet.</p>
          ) : (
            <div className="space-y-4">
              {accounts.map((a) => {
                const connected = Boolean(a.refreshTokenEnc || a.accessTokenEnc);
                return (
                  <div key={a.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{a.displayName || a.email}</p><Badge className={connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}>{connected ? "CONNECTED" : "DISCONNECTED"}</Badge></div>
                        <p className="mt-1 text-sm text-muted2">{a.email}</p>
                        <p className="mt-1 text-xs text-muted2">Added {formatDateTime(a.createdAt)}</p>
                      </div>
                      <div className="flex gap-2">
                        {connected ? <Link href={`/app/mail?mailbox=${a.id}&folder=INBOX`}><Button variant="outline" size="sm">Open mailbox</Button></Link> : null}
                        {connected ? <form action={disconnectMailbox.bind(null, a.id)}><Button variant="danger" size="sm">Disconnect</Button></form> : null}
                      </div>
                    </div>
                    <form action={updateMailboxProfile.bind(null,a.id)} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_auto_auto] md:items-end">
                      <label className="text-sm"><span className="mb-1 block text-xs font-medium text-muted2">Display name</span><Input name="displayName" defaultValue={a.displayName ?? ""} placeholder="Finance, Travel, Support…" maxLength={80}/></label>
                      <label className="flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="checkbox" name="aiEnabled" defaultChecked={a.aiEnabled}/><span>JUN AI enabled</span></label>
                      <Button variant="secondary">Save profile</Button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
