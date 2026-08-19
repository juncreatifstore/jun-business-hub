import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { googleConfigured } from "@/lib/google/gmail";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { disconnectMailbox } from "@/services/mailbox";
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
      <PageHeader title="Email integration" subtitle="Connect Google Workspace mailboxes (contact@, finance@, contracts@, support@, travel@…) so JUN Mail syncs and sends for real." />

      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> Connect a Gmail / Google Workspace mailbox</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {configured ? (
            <>
              <p className="text-sm text-muted2">You will be redirected to Google to authorize read, send and label access for one mailbox. The refresh token is stored encrypted and never leaves the server.</p>
              <a href="/api/google/oauth/start"><Button variant="primary">Connect Gmail</Button></a>
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium text-amber-300">READY — CREDENTIALS REQUIRED</p>
              <p className="mt-1 text-muted2">The full OAuth flow, sync and send are implemented. Set these environment variables, then this button activates:</p>
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
            <ul className="divide-y divide-white/5">
              {accounts.map((a) => {
                const connected = Boolean(a.refreshTokenEnc || a.accessTokenEnc);
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">{a.email}</p>
                      <p className="text-xs text-muted2">Added {formatDateTime(a.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={connected ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}>{connected ? "CONNECTED" : "DISCONNECTED"}</Badge>
                      {connected ? (
                        <form action={disconnectMailbox.bind(null, a.id)}><Button variant="danger" size="sm">Disconnect</Button></form>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
