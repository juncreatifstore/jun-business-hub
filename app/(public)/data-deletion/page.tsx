import type { Metadata } from "next";
import { LegalPage, normalizeLegalLocale } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Data Deletion | JUN CREATIF HUB",
  description: "How to disconnect Google and request deletion of data from JUN Business Hub.",
};

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <LegalPage kind="deletion" locale={normalizeLegalLocale(lang)} />;
}
