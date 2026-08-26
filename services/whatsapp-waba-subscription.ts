"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { subscribeCurrentMetaAppToWaba } from "@/lib/whatsapp-waba-subscription";

export async function subscribeWhatsAppAppToWaba() {
  const user = await assertPermission("SETTINGS_MANAGE");
  let errorMessage = "";
  try {
    const result = await subscribeCurrentMetaAppToWaba();
    await audit({
      userId: user.id,
      action: "WHATSAPP_WABA_SUBSCRIBE",
      resourceType: "WhatsAppBusinessAccount",
      resourceId: "whatsapp",
      after: result as any,
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to subscribe Meta app to WABA";
  }
  revalidatePath("/app/settings/whatsapp");
  if (errorMessage) redirect(`/app/settings/whatsapp?toast_error=${encodeURIComponent(errorMessage)}`);
  redirect(`/app/settings/whatsapp?toast=${encodeURIComponent("Meta app subscribed to WhatsApp Business Account")}`);
}
