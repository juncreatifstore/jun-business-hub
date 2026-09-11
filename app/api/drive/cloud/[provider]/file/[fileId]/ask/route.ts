import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { extractIndexableText } from "@/lib/drive-intelligence";
import { downloadCloudFile, getCloudConnection, isCloudAdmin, type CloudProvider } from "@/lib/drive-cloud";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function providerOf(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
}

/** Ask AI about a connected-cloud file — read on the fly, nothing is stored in JUN Drive. */
export async function POST(req: Request, props: { params: Promise<{ provider: string; fileId: string }> }) {
  const params = await props.params;
  const user = await assertPermission("AI_USE");
  if (!isCloudAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const provider = providerOf(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const connection = await getCloudConnection(user.id, provider);
  if (!connection) return NextResponse.json({ error: "Cloud not connected" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const question = String(body?.question ?? "")
    .trim()
    .slice(0, 1200);
  if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 });
  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });

  try {
    const file = await downloadCloudFile(connection, params.fileId, { forPreview: true });
    const text = extractIndexableText(file.data, file.mimeType);
    const context = [
      `Filename: ${file.name}`,
      `MIME type: ${file.mimeType}`,
      text
        ? `Extracted content:\n${text.slice(0, 12000)}`
        : "Extracted content is unavailable for this file type.",
    ].join("\n\n");
    const { generateText } = await import("ai");
    const { openai } = await import("@ai-sdk/openai");
    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
      system:
        "Answer questions about one file from the user's connected cloud drive. Use only the supplied file context. If the answer is not supported by the context, say that the information is not available in the file content. Never invent identity, financial, legal, visa, or travel facts.",
      prompt: `${context}\n\nQuestion: ${question}`,
      temperature: 0.1,
    });
    await audit({
      userId: user.id,
      action: "CLOUD_FILE_AI_QUESTION",
      resourceType: "CloudFile",
      resourceId: params.fileId,
      after: { provider, name: file.name, question: question.slice(0, 300) },
    });
    return NextResponse.json({ answer: result.text || "No answer generated.", extracted: Boolean(text) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed" },
      { status: 500 },
    );
  }
}
