import type { Metadata } from "next";
import "./globals.css";
import { prisma } from "@/lib/prisma";

// Fonts load at runtime via <link> (no build-time fetch — works in offline/CI builds).
// CSS variables --font-display/--font-sans/--font-mono are set in globals.css with
// robust system fallbacks, so the UI stays correct even before fonts arrive.

export const metadata: Metadata = {
  title: { default: "JUN CREATIF AND TRAVEL LLC", template: "%s · JUN" },
  description: "JUN CREATIF AND TRAVEL LLC — travel, documents, and business services. JUN Business Hub.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.juncreatif.org"),
};

async function brandingVars(): Promise<string | null> {
  // Branding overrides stored in AppSetting (Settings > Branding). Fail open: if the
  // database is unreachable (e.g. build time), fall back to compiled defaults.
  try {
    if (!process.env.DATABASE_URL) return null;
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: ["brand.primary", "brand.secondary", "brand.accent"] } },
    });
    if (rows.length === 0) return null;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const css: string[] = [];
    if (map["brand.primary"]) css.push(`--jun-night: ${map["brand.primary"]};`);
    if (map["brand.secondary"]) css.push(`--jun-electric: ${map["brand.secondary"]};`);
    if (map["brand.accent"]) css.push(`--jun-gold: ${map["brand.accent"]};`);
    return css.length ? `:root{${css.join("")}}` : null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const vars = await brandingVars();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..800&family=Public+Sans:wght@300..800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
        {vars ? <style dangerouslySetInnerHTML={{ __html: vars }} /> : null}
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
