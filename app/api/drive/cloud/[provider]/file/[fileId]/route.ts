import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { downloadCloudFile, getCloudConnection, isCloudAdmin, type CloudProvider } from "@/lib/drive-cloud";
import { isOfficeMime, officeToPdf } from "@/lib/office-preview";

export const dynamic = "force-dynamic";

function providerOf(value: string): CloudProvider | null {
  return value === "google" || value === "microsoft" ? value : null;
}

/** Streams a connected-cloud file through the hub so it can be viewed in-app. */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ provider: string; fileId: string }> },
) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isCloudAdmin(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const provider = providerOf(params.provider);
  if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const connection = await getCloudConnection(user.id, provider);
  if (!connection) return NextResponse.json({ error: `${provider} is not connected` }, { status: 404 });

  try {
    const download = req.nextUrl.searchParams.get("download") === "1";
    const file = await downloadCloudFile(connection, params.fileId, { forPreview: !download });
    if (!download && isOfficeMime(file.mimeType)) {
      const pdf = await officeToPdf({ data: file.data, mimeType: file.mimeType, name: file.name }).catch(
        () => null,
      );
      if (pdf) {
        return new NextResponse(new Uint8Array(pdf), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdf.length),
            "Content-Disposition": `inline; filename="${file.name.replace(/[\r\n"]/g, "_")}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
    }
    const disposition = download ? "attachment" : "inline";
    const safeName = file.name.replace(/[\r\n"]/g, "_");
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.data.byteLength),
        "Content-Disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to open this file" },
      { status: 502 },
    );
  }
}
