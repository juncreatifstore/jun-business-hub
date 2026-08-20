import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveSettings } from "@/services/settings";

export const dynamic = "force-dynamic";

async function previewUrl(key?: string) {
  if (!key) return null;
  try { return await storage().getSignedUrl(key, 900); } catch { return null; }
}

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");

  const rows = await prisma.appSetting.findMany();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const [logoUrl, sealUrl] = await Promise.all([
    previewUrl(s["document.logo_key"]),
    previewUrl(s["document.seal_key"]),
  ]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company identity, official document branding, security and numbering." />

      <div className="mb-8 flex flex-wrap gap-3">
        <a href="/app/settings/security" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-electric hover:text-electric">Security — MFA & sessions →</a>
        <a href="/app/settings/email" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-electric hover:text-electric">Email — Connect Gmail →</a>
      </div>

      <form action={saveSettings} encType="multipart/form-data" className="max-w-4xl space-y-8">
        <Card>
          <CardHeader><CardTitle>Official company identity</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Legal company name"><Input name="company.name" defaultValue={s["company.name"] ?? "JUN CREATIF AND TRAVEL LLC"} /></Field>
            <Field label="Business tagline"><Input name="company.tagline" defaultValue={s["company.tagline"] ?? "Travel · Documents · Business Services"} /></Field>
            <Field label="PO Box"><Input name="company.po_box" defaultValue={s["company.po_box"] ?? "PO Box 770064, Orlando, FL 32877"} /></Field>
            <Field label="Physical / additional address"><Input name="company.address" defaultValue={s["company.address"] ?? ""} /></Field>
            <Field label="Official phone"><Input name="company.phone" defaultValue={s["company.phone"] ?? "+1 480-954-1260"} /></Field>
            <Field label="WhatsApp"><Input name="company.whatsapp" defaultValue={s["company.whatsapp"] ?? ""} /></Field>
            <Field label="Official email"><Input name="company.email" type="email" defaultValue={s["company.email"] ?? ""} /></Field>
            <Field label="Public website"><Input name="company.website" defaultValue={s["company.website"] ?? "https://www.juncreatif.org"} /></Field>
            <Field label="Registration / filing number"><Input name="company.registration" defaultValue={s["company.registration"] ?? ""} /></Field>
            <Field label="Tax ID / EIN"><Input name="company.tax_id" defaultValue={s["company.tax_id"] ?? ""} /></Field>
            <p className="text-xs text-muted2 sm:col-span-2">These values are the source of truth for newly generated official JUN PDFs. Leave optional fields blank when they should not appear.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Official document assets</CardTitle></CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold">Premium logo</p>
              <p className="mt-1 text-xs text-muted2">Used in the document header and repeated as a light watermark pattern.</p>
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface p-4">
                {logoUrl ? <img src={logoUrl} alt="Current JUN premium logo" className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-muted2">No logo uploaded</span>}
              </div>
              <input name="document.logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-4 block w-full text-sm" />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted2"><input type="checkbox" name="document.logo_remove" value="yes" /> Remove current logo</label>
              <p className="mt-2 text-[11px] text-muted2">PNG transparent recommended · JPG/WEBP accepted · max 5 MB.</p>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold">Company seal</p>
              <p className="mt-1 text-xs text-muted2">Placed near the bottom of official document pages.</p>
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface p-4">
                {sealUrl ? <img src={sealUrl} alt="Current company seal" className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-muted2">No seal uploaded</span>}
              </div>
              <input name="document.seal" type="file" accept="image/png,image/jpeg,image/webp" className="mt-4 block w-full text-sm" />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted2"><input type="checkbox" name="document.seal_remove" value="yes" /> Remove current seal</label>
              <p className="mt-2 text-[11px] text-muted2">PNG transparent recommended · JPG/WEBP accepted · max 5 MB.</p>
            </div>

            <div className="md:col-span-2 grid gap-5 sm:grid-cols-3">
              <Field label="Watermark opacity" hint="0.02 to 0.12"><Input name="document.watermark_opacity" defaultValue={s["document.watermark_opacity"] ?? "0.055"} /></Field>
              <Field label="Seal size (pt)" hint="40 to 120"><Input name="document.seal_size" defaultValue={s["document.seal_size"] ?? "72"} /></Field>
              <Field label="Document footer label"><Input name="document.footer_label" defaultValue={s["document.footer_label"] ?? ""} placeholder="Optional" /></Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Interface branding</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Field label="Primary (night)" hint='HSL, e.g. "222 47% 11%"'><Input name="brand.primary" defaultValue={s["brand.primary"] ?? ""} placeholder="222 47% 11%" /></Field>
            <Field label="Secondary (electric)" hint='HSL, e.g. "217 91% 60%"'><Input name="brand.secondary" defaultValue={s["brand.secondary"] ?? ""} placeholder="217 91% 60%" /></Field>
            <Field label="Accent (gold)" hint='HSL, e.g. "43 74% 49%"'><Input name="brand.accent" defaultValue={s["brand.accent"] ?? ""} placeholder="43 74% 49%" /></Field>
            <p className="text-xs text-muted2 sm:col-span-3">Leave a color empty to restore the built-in default.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Numbering</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Yearly counter reset" hint='"on" resets yearly document/case counters each January.'>
              <Input name="numbering.year_reset" defaultValue={s["numbering.year_reset"] ?? "on"} />
            </Field>
            <p className="text-xs text-muted2">Registry formats remain fixed for auditability.</p>
          </CardContent>
        </Card>

        <Button type="submit" variant="primary">Save settings</Button>
      </form>
    </div>
  );
}
