import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { isCloudAdmin } from "@/lib/drive-cloud";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { loadRequirementProfiles } from "@/lib/document-requirements";
import { DOC_TYPES, DOC_TYPE_LABELS } from "@/lib/file-extraction";
import { saveRequirements, resetRequirements } from "@/services/document-requirements";

export const dynamic = "force-dynamic";

export default async function RequirementsPage(props: {
  searchParams: Promise<{ toast?: string; toast_error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!isCloudAdmin(user.role)) redirect("/app/forbidden");
  const profiles = await loadRequirementProfiles();

  return (
    <div className="space-y-5 text-ink">
      <Link
        prefetch={false}
        href="/app/drive/clients"
        className="inline-flex items-center gap-1 text-xs text-muted2 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Documents by client
      </Link>
      <PageHeader
        eyebrow="Drive"
        title="Document checklists"
        subtitle="Which pieces are required or optional for each kind of case. A case is matched to a profile when its type contains one of the keywords."
      />
      {searchParams.toast ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{searchParams.toast}</p>
      ) : null}
      {searchParams.toast_error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{searchParams.toast_error}</p>
      ) : null}

      <form action={saveRequirements} className="space-y-4">
        {profiles.map((p, idx) => (
          <Card key={p.key}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-3 text-base">
                <input type="hidden" name={`p${idx}.key`} value={p.key} />
                <input
                  name={`p${idx}.label`}
                  defaultValue={p.label}
                  className="h-9 rounded-lg border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-electric"
                />
                {p.key !== "default" ? (
                  <input
                    name={`p${idx}.keywords`}
                    defaultValue={p.keywords.join(", ")}
                    placeholder="keywords, comma separated"
                    className="h-9 min-w-72 flex-1 rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-electric"
                  />
                ) : (
                  <span className="text-xs font-normal text-muted2">Fallback when no keyword matches</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {DOC_TYPES.filter((t) => t !== "OTHER").map((t) => {
                const value = p.required.includes(t) ? "required" : p.optional.includes(t) ? "optional" : "";
                return (
                  <label
                    key={t}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <span>{DOC_TYPE_LABELS[t]}</span>
                    <select
                      name={`p${idx}.${t}`}
                      defaultValue={value}
                      className="h-8 rounded-md border border-line bg-white px-2 text-xs outline-none focus:border-electric"
                    >
                      <option value="">—</option>
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        ))}
        <input type="hidden" name="count" value={profiles.length} />
        <div className="flex gap-2">
          <Button type="submit">Save checklists</Button>
          <Button type="submit" formAction={resetRequirements} variant="secondary">
            Reset to defaults
          </Button>
        </div>
      </form>
    </div>
  );
}
