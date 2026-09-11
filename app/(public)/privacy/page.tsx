import type { Metadata } from "next";
import { LegalPage, normalizeLegalLocale } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | JUN CREATIF HUB",
  description: "How JUN Business Hub uses and protects personal and Google user data.",
};

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <LegalPage kind="privacy" locale={normalizeLegalLocale(lang)} />;
}
