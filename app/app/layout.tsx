import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app/shell";
import { GeneratedDocumentWhatsAppShortcut } from "@/components/app/generated-document-whatsapp-shortcut";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <AppShell user={{ firstName: user.firstName, lastName: user.lastName, role: user.role }} unread={unread}>
      {children}
      <GeneratedDocumentWhatsAppShortcut />
    </AppShell>
  );
}
