import Link from "next/link";
import { MessageCircle, CheckCheck, UserRound, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeWhatsAppInboxPayload } from "@/lib/whatsapp-inbox";
import { markWhatsAppConversationRead, replyWhatsAppConversation } from "@/services/whatsapp-inbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows() {
  return prisma.activity.findMany({
    where: {
      resourceType: "WhatsAppConversation",
      type: { in: ["WHATSAPP_INBOUND_UNREAD", "WHATSAPP_INBOUND_READ", "WHATSAPP_OUTBOUND_REPLY"] },
      resourceId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      client: { select: { id: true, internalId: true, firstName: true, lastName: true } },
      case: { select: { id: true, caseNumber: true, title: true } },
      user: { select: { firstName: true, lastName: true } },
    },
  });
}

export default async function WhatsAppInboxPage({ searchParams }: { searchParams: { phone?: string } }) {
  const user = await requireUser();
  if (user.role === "CLIENT") return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">WhatsApp Inbox is available to JUN staff only.</div>;

  const rows = await loadRows();
  const conversations = groupConversations(rows);
  const requested = String(searchParams.phone || "").replace(/[^0-9]/g, "");
  const selectedPhone = conversations.some((c) => c.phone === requested) ? requested : conversations[0]?.phone || "";
  const selected = conversations.find((c) => c.phone === selectedPhone);
  const messages = rows
    .filter((r) => r.resourceId === selectedPhone)
    .map((r) => ({ row: r, payload: decodeWhatsAppInboxPayload(r.message) }))
    .filter((x) => x.payload)
    .reverse();
  const unreadTotal = rows.filter((r) => r.type === "WHATSAPP_INBOUND_UNREAD").length;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[.18em] text-muted2">Communication</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold"><MessageCircle className="h-7 w-7"/>WhatsApp Inbox</h1><p className="mt-1 text-sm text-muted2">Incoming client replies from the JUN WhatsApp Business number.</p></div>
      <div className="flex items-center gap-2"><Link href="/app/whatsapp" className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium">Send notifications</Link><div className="rounded-full border border-line bg-white px-3 py-1.5 text-sm"><strong>{unreadTotal}</strong> unread</div></div>
    </div>

    {!conversations.length ? <Card><CardContent className="p-8 text-center text-sm text-muted2">No incoming WhatsApp replies yet. When a client replies, the conversation will appear here automatically.</CardContent></Card> :
    <div className="grid min-h-[650px] gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="overflow-hidden"><CardHeader><CardTitle>Conversations</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[720px] overflow-y-auto divide-y divide-line">{conversations.map((c) => <Link key={c.phone} href={`/app/whatsapp/inbox?phone=${encodeURIComponent(c.phone)}`} className={`block p-4 hover:bg-surface ${c.phone===selectedPhone?"bg-surface":""}`}>
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{c.name}</div><div className="mt-0.5 text-xs text-muted2">+{c.phone}{c.clientId?` · ${c.internalId}`:" · Unknown contact"}</div></div>{c.unread?<span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">{c.unread} NEW</span>:null}</div>
        <div className="mt-2 truncate text-sm text-muted2">{c.preview}</div><div className="mt-1 text-[10px] text-muted2">{formatWhen(c.lastAt)}</div>
      </Link>)}</div></CardContent></Card>

      <Card className="overflow-hidden">{selected ? <>
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{selected.name}</CardTitle><div className="mt-1 text-xs text-muted2">+{selected.phone}</div>{selected.clientId?<div className="mt-2 flex flex-wrap gap-3 text-xs"><Link className="text-electric hover:underline" href={`/app/clients/${selected.clientId}`}><UserRound className="mr-1 inline h-3.5 w-3.5"/>Open Client 360</Link>{selected.caseId?<Link className="text-electric hover:underline" href={`/app/cases/${selected.caseId}`}>Open Case</Link>:null}</div>:<div className="mt-2 text-xs text-amber-700">This number is not linked to a JUN client yet.</div>}</div>
          {selected.unread?<form action={markWhatsAppConversationRead.bind(null,selected.phone)}><Button variant="outline" size="sm"><CheckCheck className="h-4 w-4"/>Mark read</Button></form>:null}
        </div></CardHeader>
        <CardContent className="flex min-h-[560px] flex-col p-0">
          <div className="flex-1 space-y-3 overflow-y-auto bg-surface/50 p-4">{messages.map(({row,payload}) => payload ? <div key={row.id} className={`flex ${payload.direction==="OUTBOUND"?"justify-end":"justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${payload.direction==="OUTBOUND"?"bg-night text-white":"border border-line bg-white text-ink"}`}>
            {payload.type!=="text"?<div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase opacity-70"><Paperclip className="h-3 w-3"/>{payload.type.replaceAll("_"," ")}</div>:null}
            <div className="whitespace-pre-wrap break-words">{payload.text}</div>{payload.filename?<div className="mt-1 text-xs opacity-70">{payload.filename}</div>:null}
            <div className="mt-1 text-right text-[10px] opacity-60">{formatWhen(new Date(payload.timestamp))}{payload.direction==="OUTBOUND"&&row.user?` · ${row.user.firstName}`:""}</div>
          </div></div> : null)}</div>
          <form action={replyWhatsAppConversation.bind(null,selected.phone)} className="border-t border-line bg-white p-4"><Textarea name="message" rows={3} required maxLength={4096} placeholder="Reply to this client on WhatsApp…"/><div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-muted2">A client reply opens Meta&apos;s customer-service window, so free-text replies can be sent from JUN while that window is active.</p><Button variant="primary" type="submit">Send reply</Button></div></form>
        </CardContent>
      </> : null}</Card>
    </div>}
  </div>;
}

function groupConversations(rows: Row[]) {
  const map = new Map<string, {phone:string;name:string;clientId:string|null;internalId:string|null;caseId:string|null;preview:string;lastAt:Date;unread:number}>();
  for (const row of rows) {
    const phone = String(row.resourceId || "");
    if (!phone) continue;
    const payload = decodeWhatsAppInboxPayload(row.message);
    if (!payload) continue;
    const existing = map.get(phone);
    if (!existing) {
      map.set(phone, {
        phone,
        name: row.client ? `${row.client.firstName} ${row.client.lastName}` : (payload.contactName || `+${phone}`),
        clientId: row.client?.id || null,
        internalId: row.client?.internalId || null,
        caseId: row.case?.id || null,
        preview: payload.text,
        lastAt: row.createdAt,
        unread: row.type === "WHATSAPP_INBOUND_UNREAD" ? 1 : 0,
      });
    } else if (row.type === "WHATSAPP_INBOUND_UNREAD") existing.unread++;
  }
  return [...map.values()].sort((a,b)=>b.lastAt.getTime()-a.lastAt.getTime());
}

function formatWhen(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }).format(value);
}
