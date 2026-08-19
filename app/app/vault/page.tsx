import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { uploadFile, deleteFile } from "@/services/files";
import { VAULT_CATEGORIES } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { ShieldCheck, Download, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function VaultPage({ searchParams }: { searchParams: { cat?: string } }) {
  const user = await requireUser();
  if (!can(user, "VAULT_READ")) redirect("/app/forbidden");
  const canManage = can(user, "VAULT_MANAGE");

  const cat = searchParams.cat && (VAULT_CATEGORIES as readonly string[]).includes(searchParams.cat) ? searchParams.cat : undefined;

  const files = await prisma.file.findMany({
    where: { isVault: true, ...(cat ? { vaultCategory: cat } : {}) },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true },
  });

  return (
    <div>
      <PageHeader title="Company Vault" subtitle="Restricted area for corporate documents. Every access is written to the audit log." />

      <div className="mb-6 flex flex-wrap gap-2">
        <a href="/app/vault" className={`rounded-full border px-3 py-1 text-sm ${!cat ? "border-gold text-gold" : "border-white/10 text-muted2 hover:text-white"}`}>All</a>
        {VAULT_CATEGORIES.map((c) => (
          <a key={c} href={`/app/vault?cat=${encodeURIComponent(c)}`} className={`rounded-full border px-3 py-1 text-sm ${cat === c ? "border-gold text-gold" : "border-white/10 text-muted2 hover:text-white"}`}>{c}</a>
        ))}
      </div>

      {canManage ? (
        <Card className="mb-6">
          <CardHeader><CardTitle>Add to vault</CardTitle></CardHeader>
          <CardContent>
            <FileUploadForm action={uploadFile} isVault categories={[]} vaultCategories={VAULT_CATEGORIES} />
          </CardContent>
        </Card>
      ) : null}

      {files.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Vault is empty" description={cat ? `No documents under “${cat}”.` : "Corporate legal, banking, tax and license documents will live here."} />
      ) : (
        <Table>
          <THead><tr><TH>Name</TH><TH>Category</TH><TH>Uploaded</TH><TH>By</TH><TH></TH></tr></THead>
          <tbody>
            {files.map((f) => (
              <TR key={f.id}>
                <TD><a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="font-medium hover:text-gold">{f.name}</a></TD>
                <TD><Badge className="bg-gold/15 text-gold">{f.vaultCategory ?? "—"}</Badge></TD>
                <TD className="text-muted2">{formatDate(f.createdAt)}</TD>
                <TD className="text-muted2">{f.uploadedBy.firstName} {f.uploadedBy.lastName}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-2">
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded-md p-2 text-muted2 hover:bg-white/5 hover:text-white" title="Open"><Download className="h-4 w-4" /></a>
                    {canManage ? (
                      <form action={deleteFile.bind(null, f.id)}>
                        <button type="submit" className="rounded-md p-2 text-muted2 hover:bg-red-500/10 hover:text-red-400" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      </form>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
