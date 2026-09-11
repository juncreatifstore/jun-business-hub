import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, mfaRequiredFor } from "@/lib/auth";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app/shell";
import { GeneratedDocumentWhatsAppShortcut } from "@/components/app/generated-document-whatsapp-shortcut";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Sensitive roles must enrol MFA before using the hub; only Security stays reachable.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (
    mfaRequiredFor(user) &&
    !pathname.startsWith("/app/settings/security") &&
    !pathname.startsWith("/app/forbidden")
  )
    redirect("/app/settings/security?required=1");
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <AppShell
      user={{ firstName: user.firstName, lastName: user.lastName, role: user.role }}
      unread={unread}
      theme={theme}
    >
      {children}
      <GeneratedDocumentWhatsAppShortcut />
    </AppShell>
  );
}
