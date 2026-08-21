"use server";

import { redirect } from "next/navigation";
import { decideRefund } from "@/services/refunds";

export async function decideRefundSafe(refundId: string, formData: FormData) {
  try {
    await decideRefund(refundId, formData);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "The refund decision could not be completed.";
    redirect(`/app/finance/refunds/${refundId}?toast_error=${encodeURIComponent(message)}`);
  }
}
