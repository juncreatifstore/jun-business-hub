import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertPermission } from "@/lib/auth";
import { getDriveIntelligence, indexDriveFile } from "@/lib/drive-intelligence";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await assertPermission("AI_USE");
  await assertPermission("FILE_READ");
  const file = await prisma.file.findFirst({ where: { id: params.id, isVault: false, archivedAt: null }, select: { id: true, name: true, category: true, mimeType: true } });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "").trim().slice(0, 1200);
  if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

  let intel = (await getDriveIntelligence(file.id)).intelligence;
  if (!intel) {
    await indexDriveFile(file.id);
    intel = (await getDriveIntelligence(file.id)).intelligence;
  }
  const context = [
    `Filename: ${file.name}`,
    `Category: ${file.category}`,
    `MIME type: ${file.mimeType}`,
    intel?.summary ? `AI summary: ${intel.summary}` : "",
    intel?.keyFacts?.length ? `Key facts: ${intel.keyFacts.join("; ")}` : "",
    intel?.contentExcerpt ? `Extracted content:\n${intel.contentExcerpt.slice(0, 12000)}` : "Extracted content is unavailable for this file type.",
  ].filter(Boolean).join("\n\n");

  try {
    const { generateText } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      system: "Answer questions about one internal JUN Drive file. Use only the supplied file context. If the answer is not supported by the context, say that the information is not available in the indexed content. Never invent identity, financial, legal, visa, or travel facts.",
      prompt: `${context}\n\nQuestion: ${question}`,
      temperature: 0.1,
    });
    await audit({ userId: user.id, action: "FILE_AI_QUESTION", resourceType: "File", resourceId: file.id, after: { question: question.slice(0, 300) } });
    return NextResponse.json({ answer: result.text || "No answer generated." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 500 });
  }
}
