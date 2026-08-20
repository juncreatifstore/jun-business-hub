import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth";
import { getDriveCollaborationSnapshot, type DriveCollaborationResource } from "@/lib/drive-collaboration";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { resourceType: string; resourceId: string } }) {
  const user = await assertPermission("FILE_READ");
  const resourceType = params.resourceType === "File" || params.resourceType === "Folder" ? params.resourceType as DriveCollaborationResource : null;
  if (!resourceType) return NextResponse.json({ error: "Invalid resource type" }, { status: 400 });
  const snapshot = await getDriveCollaborationSnapshot(resourceType, params.resourceId);
  if (!snapshot.resource) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  return NextResponse.json({ ...snapshot, currentUserId: user.id }, { headers: { "Cache-Control": "no-store" } });
}
