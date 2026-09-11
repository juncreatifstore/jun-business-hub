import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Clock3, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { caseChecklist } from "@/lib/document-requirements";
import { DOC_TYPE_LABELS } from "@/lib/file-extraction";

/** Required / optional pieces for this case, resolved against case + client files. */
export async function CaseChecklistCard({ caseId, clientId }: { caseId: string; clientId: string }) {
  const data = await caseChecklist(caseId);
  if (!data) return null;
  const { profile, items, done, total } = data;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const icon = (s: (typeof items)[number]["status"]) =>
    s === "present" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    ) : s === "expiring" ? (
      <Clock3 className="h-4 w-4 text-amber-600" />
    ) : s === "expired" ? (
      <AlertTriangle className="h-4 w-4 text-red-600" />
    ) : (
      <Circle className="h-4 w-4 text-muted2" />
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Document checklist
          <span className="text-xs font-normal text-muted2">· {profile.label}</span>
        </CardTitle>
        <span className={`text-xs font-medium ${pct === 100 ? "text-emerald-700" : "text-muted2"}`}>
          {done}/{total} required
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="mx-5 mb-3 h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-electric"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.docType} className="flex items-center gap-3 px-5 py-2 text-sm">
              {icon(i.status)}
              <span className={i.required ? "font-medium" : "text-muted2"}>
                {DOC_TYPE_LABELS[i.docType]}
                {!i.required ? <span className="ml-1 text-[11px]">optional</span> : null}
              </span>
              <span className="ml-auto flex items-center gap-2 text-xs text-muted2">
                {i.fileId ? (
                  <>
                    <a
                      href={`/api/files/${i.fileId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:text-electric"
                    >
                      {i.fileName}
                    </a>
                    {i.source === "client" ? (
                      <span className="rounded bg-surface px-1">client file</span>
                    ) : null}
                    {i.expiresAt ? (
                      <span
                        className={
                          i.status === "expired"
                            ? "text-red-700"
                            : i.status === "expiring"
                              ? "text-amber-700"
                              : ""
                        }
                      >
                        {i.status === "expired" ? "expired " : "exp. "}
                        {i.expiresAt.toLocaleDateString("fr-FR")}
                      </span>
                    ) : null}
                  </>
                ) : i.required ? (
                  <span className="text-amber-700">missing</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between px-5 py-3 text-xs text-muted2">
          <Link prefetch={false} href={`/app/drive/clients/${clientId}`} className="hover:text-electric">
            Client documents →
          </Link>
          <Link prefetch={false} href="/app/drive/clients/requirements" className="hover:text-electric">
            Edit checklists
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
