"use client";
import { Trash2 } from "lucide-react";
import { trashCloudFile } from "@/services/drive-cloud";

/** Trash a cloud file after an explicit confirmation. */
export function CloudTrashButton({
  provider,
  fileId,
  name,
  returnTo,
  providerLabel,
  variant = "icon",
}: {
  provider: string;
  fileId: string;
  name: string;
  returnTo: string;
  providerLabel: string;
  variant?: "icon" | "button";
}) {
  return (
    <form
      action={trashCloudFile}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Move “${name}” to the ${providerLabel} trash?\n\nIt can be restored from ${providerLabel} for 30 days.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="provider" value={provider} />
      <input type="hidden" name="fileId" value={fileId} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {variant === "icon" ? (
        <button
          className="rounded-md p-1.5 text-muted2 transition hover:bg-red-50 hover:text-red-600"
          title={`Move to ${providerLabel} trash`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <button className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs text-red-700 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" /> Move to trash
        </button>
      )}
    </form>
  );
}
