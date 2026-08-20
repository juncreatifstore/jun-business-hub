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

function checked(value: string | undefined, fallback = true) {
  if (value == null) return fallback;
  return value === "on";
}

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");

  const rows = await prisma.appSetting.findMany();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const [logoUrl, sealUrl, signatureUrl] = await Promise.all([
    previewUrl(s["document.logo_key"]),
    previewUrl(s["document.seal_key"]),
    previewUrl(s["document.signature_key"]),
  ]);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company identity, official document branding, security and numbering." />

      <div className="mb-8 flex flex-wrap gap-3">
        <a href="/app/settings/security" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-electric hover:text-electric">Security — MFA & sessions →</a>
        <a href="/app/settings/email" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-electric hover:text-electric">Email — Connect Gmail →</a>
      </div>

      <form action={saveSettings} encType="multipart/form-data" className="max-w-5xl space-y-8">
        <Card>
          <CardHeader><CardTitle>Official company identity</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Legal company name"><Input name="company.name" defaultValue={s["company.name"] ?? "JUN CREATIF AND TRAVEL LLC"} /></Field>
            <Field label="Trade name / DBA"><Input name="company.trade_name" defaultValue={s["company.trade_name"] ?? ""} /></Field>
            <Field label="Business tagline"><Input name="company.tagline" defaultValue={s["company.tagline"] ?? "Travel · Documents · Business Services"} /></Field>
            <Field label="Legal representative"><Input name="company.legal_representative" defaultValue={s["company.legal_representative"] ?? ""} /></Field>
            <Field label="Representative title"><Input name="company.representative_title" defaultValue={s["company.representative_title"] ?? ""} placeholder="Owner / Manager / Director" /></Field>
            <Field label="Formation date"><Input name="company.formation_date" type="date" defaultValue={s["company.formation_date"] ?? ""} /></Field>
            <Field label="Registration country"><Input name="company.registration_country" defaultValue={s["company.registration_country"] ?? "United States"} /></Field>
            <Field label="Registration state / province"><Input name="company.registration_state" defaultValue={s["company.registration_state"] ?? "Florida"} /></Field>
            <Field label="Registration / filing number"><Input name="company.registration" defaultValue={s["company.registration"] ?? ""} /></Field>
            <Field label="Tax ID / EIN"><Input name="company.tax_id" defaultValue={s["company.tax_id"] ?? ""} /></Field>
            <p className="text-xs text-muted2 sm:col-span-2">These values are the source of truth for official JUN documents, receipts, contracts and signature workflows.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Addresses & contact information</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Legal / physical address"><Input name="company.address" defaultValue={s["company.address"] ?? ""} /></Field>
            <Field label="Mailing address"><Input name="company.mailing_address" defaultValue={s["company.mailing_address"] ?? ""} /></Field>
            <Field label="PO Box"><Input name="company.po_box" defaultValue={s["company.po_box"] ?? "PO Box 770064, Orlando, FL 32877"} /></Field>
            <Field label="Public website"><Input name="company.website" defaultValue={s["company.website"] ?? "https://www.juncreatif.org"} /></Field>
            <Field label="Primary phone"><Input name="company.phone" defaultValue={s["company.phone"] ?? "+1 480-954-1260"} /></Field>
            <Field label="Secondary phone"><Input name="company.phone_secondary" defaultValue={s["company.phone_secondary"] ?? ""} /></Field>
            <Field label="WhatsApp"><Input name="company.whatsapp" defaultValue={s["company.whatsapp"] ?? ""} /></Field>
            <Field label="General email"><Input name="company.email" type="email" defaultValue={s["company.email"] ?? ""} /></Field>
            <Field label="Finance email"><Input name="company.finance_email" type="email" defaultValue={s["company.finance_email"] ?? ""} /></Field>
            <Field label="Documents email"><Input name="company.documents_email" type="email" defaultValue={s["company.documents_email"] ?? ""} /></Field>
            <Field label="Support email"><Input name="company.support_email" type="email" defaultValue={s["company.support_email"] ?? ""} /></Field>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium">Banking / payment instructions</label>
              <textarea name="company.bank_details" defaultValue={s["company.bank_details"] ?? ""} rows={5} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-electric" placeholder="Optional. Add only information that may appear on authorized finance documents." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Official document assets</CardTitle></CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold">Premium logo</p>
              <p className="mt-1 text-xs text-muted2">Used in headers, receipts and official PDFs.</p>
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface p-4">
                {logoUrl ? <img src={logoUrl} alt="Current JUN premium logo" className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-muted2">No logo uploaded</span>}
              </div>
              <input name="document.logo" type="file" accept="image/png,image/jpeg,image/webp" className="mt-4 block w-full text-sm" />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted2"><input type="checkbox" name="document.logo_remove" value="yes" /> Remove current logo</label>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold">Company seal</p>
              <p className="mt-1 text-xs text-muted2">Official seal for contracts and formal documents.</p>
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface p-4">
                {sealUrl ? <img src={sealUrl} alt="Current company seal" className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-muted2">No seal uploaded</span>}
              </div>
              <input name="document.seal" type="file" accept="image/png,image/jpeg,image/webp" className="mt-4 block w-full text-sm" />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted2"><input type="checkbox" name="document.seal_remove" value="yes" /> Remove current seal</label>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-semibold">Official signature</p>
              <p className="mt-1 text-xs text-muted2">Authorized representative signature asset.</p>
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface p-4">
                {signatureUrl ? <img src={signatureUrl} alt="Current official signature" className="max-h-28 max-w-full object-contain" /> : <span className="text-xs text-muted2">No signature uploaded</span>}
              </div>
              <input name="document.signature" type="file" accept="image/png,image/jpeg,image/webp" className="mt-4 block w-full text-sm" />
              <label className="mt-3 flex items-center gap-2 text-xs text-muted2"><input type="checkbox" name="document.signature_remove" value="yes" /> Remove current signature</label>
            </div>

            <p className="text-[11px] text-muted2 lg:col-span-3">Transparent PNG recommended · JPG/WEBP accepted · max 5 MB per asset.</p>

            <div className="lg:col-span-3 grid gap-5 sm:grid-cols-3">
              <Field label="Watermark opacity" hint="0.02 to 0.12"><Input name="document.watermark_opacity" defaultValue={s["document.watermark_opacity"] ?? "0.055"} /></Field>
              <Field label="Seal size (pt)" hint="40 to 120"><Input name="document.seal_size" defaultValue={s["document.seal_size"] ?? "72"} /></Field>
              <Field label="Document footer label"><Input name="document.footer_label" defaultValue={s["document.footer_label"] ?? ""} placeholder="Optional" /></Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Automatic document display</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["document.show_logo", "Show company logo", true],
              ["document.show_seal", "Show company seal", true],
              ["document.show_signature", "Show official signature", false],
              ["document.show_qr", "Show verification QR", true],
              ["document.show_tax_id", "Show EIN / Tax ID", false],
            ].map(([name, label, fallback]) => (
              <label key={String(name)} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm">
                <input type="checkbox" name={String(name)} value="on" defaultChecked={checked(s[String(name)], Boolean(fallback))} />
                <span>{String(label)}</span>
              </label>
            ))}
            <p className="text-xs text-muted2 sm:col-span-2 lg:col-span-3">These controls define the default behavior for newly generated official documents. Individual document templates can still override placement.</p>
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
