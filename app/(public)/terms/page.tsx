import type { Metadata } from "next";
import { LegalPage, normalizeLegalLocale } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | JUN CREATIF HUB",
  description: "Terms governing the use of JUN Business Hub and connected services.",
};

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <LegalPage kind="terms" locale={normalizeLegalLocale(lang)} />;
}
