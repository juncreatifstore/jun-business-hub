"use server";
import { logger } from "@/lib/logger";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  approveFinancialAuthorizationAction,
  rejectFinancialAuthorizationAction,
} from "@/services/company-funds-approvals";
import { financialAuthorizationError } from "@/lib/financial-authorization-feedback";

export async function submitFinancialAuthorizationDecision(
  id: string,
  _state: { message: string; success: boolean },
  form: FormData,
) {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN") redirect("/app/forbidden");
  try {
    const decision = form.get("decision");
    if (decision === "APPROVE") await approveFinancialAuthorizationAction(id, form);
    else if (decision === "REJECT") await rejectFinancialAuthorizationAction(id, form);
    else return { success: false, message: "Choisissez Approuver ou Rejeter." };
    return { success: true, message: "Décision enregistrée." };
  } catch (error) {
    logger.error("financial_authorization.decision_failed", { authorizationId: id, err: error });
    return { success: false, message: financialAuthorizationError(error) };
  }
}
