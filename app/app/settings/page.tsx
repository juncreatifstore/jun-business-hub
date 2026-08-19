import { requireUser, can } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveSettings } from "@/services/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  if (!can(user, "SETTINGS_MANAGE")) redirect("/app/forbidden");

  const rows = await prisma.appSetting.findMany();
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return (
    <div>
      <PageHeader title="Settings" subtitle="Company profile, branding and numbering. Changes apply immediately across the hub." />

      <div className="mb-8 flex flex-wrap gap-3">
        <a href="/app/settings/security" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-electric hover:text-electric">Security — MFA & sessions →</a>
        <a href="/app/settings/email" className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm hover:border-electric hover:text-electric">Email — Connect Gmail →</a>
      </div>

      <form action={saveSettings} className="max-w-3xl space-y-8">
        <Card>
          <CardHeader><CardTitle>Company profile</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <Field label="Company name"><Input name="company.name" defaultValue={s["company.name"] ?? "JUN CREATIF AND TRAVEL LLC"} /></Field>
            <Field label="Public website"><Input name="company.website" defaultValue={s["company.website"] ?? "https://www.juncreatif.org"} /></Field>
            <Field label="Contact email"><Input name="company.email" type="email" defaultValue={s["company.email"] ?? ""} /></Field>
            <Field label="Phone"><Input name="company.phone" defaultValue={s["company.phone"] ?? ""} /></Field>
            <div className="sm:col-span-2">
              <Field label="Address"><Input name="company.address" defaultValue={s["company.address"] ?? ""} /></Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Branding</CardTitle></CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <Field label="Primary (night)" hint='HSL, e.g. "222 47% 11%"'><Input name="brand.primary" defaultValue={s["brand.primary"] ?? ""} placeholder="222 47% 11%" /></Field>
            <Field label="Secondary (electric)" hint='HSL, e.g. "217 91% 60%"'><Input name="brand.secondary" defaultValue={s["brand.secondary"] ?? ""} placeholder="217 91% 60%" /></Field>
            <Field label="Accent (gold)" hint='HSL, e.g. "43 74% 49%"'><Input name="brand.accent" defaultValue={s["brand.accent"] ?? ""} placeholder="43 74% 49%" /></Field>
            <p className="text-xs text-muted2 sm:col-span-3">Leave a field empty to restore the built-in default. Values are injected as CSS variables at render time — invalid input is rejected server-side.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Numbering</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Yearly counter reset" hint='"on" (default) resets CASE-YYYY-###### each January; anything else keeps continuous counters.'>
              <Input name="numbering.year_reset" defaultValue={s["numbering.year_reset"] ?? "on"} />
            </Field>
            <p className="text-xs text-muted2">Formats are fixed for auditability: JUN-CLI-######, CASE-YYYY-######, JUN-CTR/AGR/RCP/INV-YYYY-######, PAY/REC/REF-YYYY-######.</p>
          </CardContent>
        </Card>

        <Button type="submit" variant="primary">Save settings</Button>
      </form>
    </div>
  );
}
